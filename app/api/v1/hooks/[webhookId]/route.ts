import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis/client";
import { getDagExecutionQueue } from "@/lib/queue/bullmq";
import {
  computeIdempotencyKey,
  seedRunIndegrees,
  checkRateLimit,
} from "@/lib/redis/lua-scripts";
import { RunStatus, TriggerSource, NodeExecStatus } from "@prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates HMAC-SHA256 signature or direct webhook secret tokens.
 */
function verifyWebhookAuthentication(
  rawBody: string,
  headers: Headers,
  expectedSecret: string,
  fallbackSecret?: string,
  querySecret?: string | null
): boolean {
  const primarySecret = expectedSecret || fallbackSecret || "";
  if (!primarySecret) {
    // If no secret configured in blueprint or environment, allow
    return true;
  }

  // 1. Direct secret from query string ?secret=... or ?key=...
  if (querySecret && (querySecret === primarySecret || querySecret === fallbackSecret)) {
    return true;
  }

  // 2. Direct secret header support (developer ease of use & studio testing)
  const directSecret = headers.get("x-webhook-secret") || "";
  const authHeader = headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (directSecret === primarySecret || directSecret === fallbackSecret) {
    return true;
  }
  if (bearerToken && (bearerToken === primarySecret || bearerToken === fallbackSecret)) {
    return true;
  }

  // 3. Cryptographic HMAC-SHA256 signature verification
  const signatureHeader =
    headers.get("x-signature-256") ||
    headers.get("x-hub-signature-256") ||
    headers.get("x-webhook-signature") ||
    headers.get("x-chronograph-signature");

  if (!signatureHeader) {
    return false;
  }

  const cleanSig = signatureHeader.replace(/^sha256[:=]/i, "").trim().toLowerCase();

  const computeHmacHex = (secret: string) =>
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex").toLowerCase();

  const checkHash = (expectedHex: string) => {
    if (expectedHex.length !== cleanSig.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(cleanSig, "utf-8"),
      Buffer.from(expectedHex, "utf-8")
    );
  };

  if (checkHash(computeHmacHex(primarySecret))) {
    return true;
  }

  if (fallbackSecret && fallbackSecret !== primarySecret) {
    if (checkHash(computeHmacHex(fallbackSecret))) {
      return true;
    }
  }

  return false;
}

/**
 * POST /api/v1/hooks/[webhookId]
 * Non-blocking, high-speed ingestion valve (< 25ms p99)
 * Authenticates HMAC, persists run, initializes Redis in-degree state, and enqueues root nodes.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ webhookId: string }> }
) {
  const startTime = Date.now();
  const rawWebhookId = (await context.params).webhookId;
  const webhookId = decodeURIComponent(rawWebhookId);

  try {
    // 1. Sliding-Window Rate Limiting (120 req / 60s window per endpoint)
    const rateLimit = await checkRateLimit(redis, webhookId, 120, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded for this webhook endpoint.",
          retryAfterSeconds: rateLimit.resetSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetSeconds),
            "X-RateLimit-Limit": "120",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // 2. Read raw payload for HMAC verification
    const rawBody = await req.text();

    // 3. Resolve Blueprint from PostgreSQL
    const isUuid = UUID_REGEX.test(webhookId);
    const blueprint = await db.workflowBlueprint.findFirst({
      where: isUuid ? { id: webhookId } : { name: webhookId },
    });

    if (!blueprint) {
      return NextResponse.json(
        {
          success: false,
          error: `Workflow with identifier '${webhookId}' was not found.`,
        },
        { status: 404 }
      );
    }

    if (!blueprint.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: `Workflow '${blueprint.name}' is currently deactivated.`,
        },
        { status: 400 }
      );
    }

    // 4. Verify HMAC Signature or Secret Token
    const fallbackSecret = process.env.WEBHOOK_SECRET;
    const querySecret =
      req.nextUrl.searchParams.get("secret") ||
      req.nextUrl.searchParams.get("key");

    const isAuthorized = verifyWebhookAuthentication(
      rawBody,
      req.headers,
      blueprint.webhookSecret,
      fallbackSecret,
      querySecret
    );

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized: Invalid or missing HMAC-SHA256 signature. Provide 'x-signature-256: sha256=<hmac>', 'x-webhook-secret: <secret>' header, or '?secret=<secret>' query parameter.",
        },
        { status: 401 }
      );
    }

    // 5. Parse JSON Payload
    let parsedPayload: Record<string, unknown> = {};
    if (rawBody && rawBody.trim().length > 0) {
      try {
        parsedPayload = JSON.parse(rawBody);
      } catch {
        parsedPayload = { raw: rawBody };
      }
    }

    // 6. Create Persistent WorkflowRun Record
    const run = await db.workflowRun.create({
      data: {
        workflowId: blueprint.id,
        status: RunStatus.RUNNING,
        triggerType: TriggerSource.WEBHOOK,
        triggerPayload: parsedPayload as any,
      },
    });

    const runId = run.id;

    // 7. Extract topology
    const baseIndegrees = (blueprint.baseIndegrees as Record<string, number>) || {};
    const adjacencyMap = (blueprint.adjacencyMap as Record<string, string[]>) || {};
    const nodes = (blueprint.nodesJson as Array<{ id: string; type?: string; data?: unknown }>) || [];

    // 8. Seed Redis runtime state (run:{id}:indegree, run:{id}:outputs)
    await seedRunIndegrees(redis, runId, baseIndegrees, {
      triggerSource: "WEBHOOK",
      webhookId,
      payload: parsedPayload,
      receivedAt: new Date().toISOString(),
    });

    // 9. Identify root nodes with in-degree == 0
    const rootNodeIds: string[] = [];
    const indegreeEntries = Object.entries(baseIndegrees);
    if (indegreeEntries.length > 0) {
      for (const [nodeId, degree] of indegreeEntries) {
        if (Number(degree) === 0) {
          rootNodeIds.push(nodeId);
        }
      }
    } else if (nodes.length > 0) {
      rootNodeIds.push(nodes[0].id);
    }

    // 10. Enqueue root nodes into BullMQ DAG worker pool & record initial QUEUED logs
    const dagQueue = getDagExecutionQueue();
    const logPromises = [];
    const jobsToEnqueue = [];

    for (const nodeId of rootNodeIds) {
      const nodeDef = nodes.find((n) => n.id === nodeId);
      const idempotencyKey = computeIdempotencyKey(runId, nodeId, 1);

      logPromises.push(
        db.nodeExecutionLog.create({
          data: {
            runId,
            nodeId,
            idempotencyKey,
            status: NodeExecStatus.QUEUED,
            attemptNumber: 1,
            inputPayload: parsedPayload as any,
          },
        })
      );

      jobsToEnqueue.push({
        name: `exec:${nodeId}`,
        data: {
          runId,
          workflowId: blueprint.id,
          nodeId,
          nodeType: nodeDef?.type || "WEBHOOK_TRIGGER",
          nodeData: nodeDef?.data || {},
          attempt: 1,
          idempotencyKey,
          downstreamNodeIds: adjacencyMap[nodeId] || [],
          triggerPayload: parsedPayload,
        },
        opts: {
          jobId: `job_${runId}_${nodeId}_1`,
        },
      });
    }

    // Concurrently execute database logging and BullMQ bulk enqueue
    await Promise.all([
      Promise.all(logPromises),
      jobsToEnqueue.length > 0 ? dagQueue.addBulk(jobsToEnqueue) : Promise.resolve(),
    ]);

    // 11. Broadcast Telemetry Event to Redis Pub/Sub for SSE listeners
    const telemetryEvent = {
      event: "WORKFLOW_TRIGGERED",
      runId,
      workflowId: blueprint.id,
      workflowName: blueprint.name,
      triggerType: "WEBHOOK",
      rootNodeCount: rootNodeIds.length,
      timestamp: new Date().toISOString(),
    };

    // Non-blocking fire-and-forget telemetry publish
    Promise.all([
      redis.publish(`channel:run:${runId}`, JSON.stringify(telemetryEvent)),
      redis.publish("channel:cluster:events", JSON.stringify(telemetryEvent)),
    ]).catch((err) => console.error("[WebhookTelemetry] PubSub publish error:", err));

    const durationMs = Date.now() - startTime;

    // 12. Return 202 Accepted Response
    return NextResponse.json(
      {
        success: true,
        runId,
        workflowId: blueprint.id,
        workflowName: blueprint.name,
        status: "ACCEPTED",
        rootNodesQueued: rootNodeIds,
        processingTimeMs: durationMs,
        timestamp: new Date().toISOString(),
      },
      {
        status: 202,
        headers: {
          "X-Run-Id": runId,
          "X-Processing-Time-Ms": String(durationMs),
          "X-RateLimit-Limit": "120",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[WebhookRoute] Ingestion failure for ${webhookId}:`, err);
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/hooks/[webhookId]
 * Diagnostic endpoint for inspecting webhook configuration & cURL snippet generation.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ webhookId: string }> }
) {
  const rawWebhookId = (await context.params).webhookId;
  const webhookId = decodeURIComponent(rawWebhookId);

  try {
    const isUuid = UUID_REGEX.test(webhookId);
    const blueprint = await db.workflowBlueprint.findFirst({
      where: isUuid ? { id: webhookId } : { name: webhookId },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        webhookSecret: true,
        createdAt: true,
      },
    });

    if (!blueprint) {
      return NextResponse.json(
        { success: false, error: `Workflow '${webhookId}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      workflow: {
        id: blueprint.id,
        name: blueprint.name,
        description: blueprint.description,
        isActive: blueprint.isActive,
      },
      curlExample: {
        directSecret: `curl -X POST "http://localhost:3000/api/v1/hooks/${blueprint.id}" -H "Content-Type: application/json" -H "x-webhook-secret: ${blueprint.webhookSecret}" -d '{"userId": 42, "event": "order_created"}'`,
        hmacSignature: `curl -X POST "http://localhost:3000/api/v1/hooks/${blueprint.id}" -H "Content-Type: application/json" -H "x-signature-256: sha256=<HMAC_SHA256_HEX>" -d '{"userId": 42, "event": "order_created"}'`,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
