import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis/client";
import { getDagExecutionQueue } from "@/lib/queue/bullmq";
import { computeIdempotencyKey } from "@/lib/redis/lua-scripts";
import { RunStatus, NodeExecStatus, Prisma } from "@prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/dlq/[jobId]/replay
 * Re-injects an exhausted/failed DLQ job back into topological execution queue.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;

  if (!UUID_REGEX.test(jobId)) {
    return NextResponse.json(
      { success: false, error: "Invalid DLQ job UUID format." },
      { status: 400 }
    );
  }

  try {
    let body: { payloadOverride?: Prisma.InputJsonObject } = {};
    const rawBody = await req.text();
    if (rawBody && rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON in request body." },
          { status: 400 }
        );
      }
    }

    const dlqJob = await db.deadLetterJob.findUnique({
      where: { id: jobId },
      include: {
        run: {
          include: {
            workflow: true,
          },
        },
      },
    });

    if (!dlqJob) {
      return NextResponse.json(
        { success: false, error: `Dead-letter job '${jobId}' was not found.` },
        { status: 404 }
      );
    }

    const blueprint = dlqJob.run?.workflow;
    if (!blueprint) {
      return NextResponse.json(
        { success: false, error: "Associated workflow blueprint not found." },
        { status: 404 }
      );
    }

    const nodes =
      (blueprint.nodesJson as Array<{ id: string; type?: string; data?: unknown }>) || [];
    const adjacencyMap =
      (blueprint.adjacencyMap as Record<string, string[]>) || {};
    const nodeDef = nodes.find((n) => n.id === dlqJob.nodeId);

    const nextAttempt = dlqJob.attemptsMade + 1;
    const idempotencyKey = computeIdempotencyKey(
      dlqJob.runId,
      dlqJob.nodeId,
      nextAttempt
    );
    const effectivePayload =
      body.payloadOverride ??
      (dlqJob.failedPayload as Prisma.InputJsonObject) ??
      {};

    // 1. Transactionally update DB state: mark DLQ replayed, run back to RUNNING, and insert new QUEUED log
    await db.$transaction([
      db.deadLetterJob.update({
        where: { id: dlqJob.id },
        data: { replayed: true },
      }),
      db.workflowRun.update({
        where: { id: dlqJob.runId },
        data: {
          status: RunStatus.RUNNING,
          completedAt: null,
        },
      }),
      db.nodeExecutionLog.create({
        data: {
          runId: dlqJob.runId,
          nodeId: dlqJob.nodeId,
          idempotencyKey,
          status: NodeExecStatus.QUEUED,
          attemptNumber: nextAttempt,
          inputPayload: effectivePayload,
        },
      }),
    ]);

    // 2. Re-enqueue node job into BullMQ DAG execution queue
    const dagQueue = getDagExecutionQueue();
    const bullmqJob = await dagQueue.add(
      `exec:${dlqJob.nodeId}`,
      {
        runId: dlqJob.runId,
        workflowId: dlqJob.workflowId,
        nodeId: dlqJob.nodeId,
        nodeType: nodeDef?.type || "HTTP_REQUEST",
        nodeData: nodeDef?.data || {},
        attempt: nextAttempt,
        idempotencyKey,
        downstreamNodeIds: adjacencyMap[dlqJob.nodeId] || [],
        triggerPayload: effectivePayload,
        isReplay: true,
      },
      {
        jobId: `job_${dlqJob.runId}_${dlqJob.nodeId}_${nextAttempt}`,
      }
    );

    // 3. Emit real-time telemetry event via Redis Pub/Sub
    const telemetryEvent = {
      event: "DLQ_JOB_REPLAYED",
      runId: dlqJob.runId,
      dlqJobId: dlqJob.id,
      nodeId: dlqJob.nodeId,
      attempt: nextAttempt,
      bullmqJobId: bullmqJob.id,
      timestamp: new Date().toISOString(),
    };

    Promise.all([
      redis.publish(`channel:run:${dlqJob.runId}`, JSON.stringify(telemetryEvent)),
      redis.publish("channel:cluster:events", JSON.stringify(telemetryEvent)),
    ]).catch((err) =>
      console.error("[DLQReplayTelemetry] PubSub publish error:", err)
    );

    return NextResponse.json({
      success: true,
      replayedJobId: dlqJob.id,
      bullmqJobId: bullmqJob.id,
      runId: dlqJob.runId,
      nodeId: dlqJob.nodeId,
      attempt: nextAttempt,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[DLQReplayRoute] Error replaying job ${jobId}:`, err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
