import { db } from "@/lib/db";
import { redis } from "@/lib/redis/client";
import { getDagExecutionQueue } from "@/lib/queue/bullmq";
import { RunStatus, TriggerSource, NodeExecStatus } from "@prisma/client";
import crypto from "crypto";

export interface CronExecutionResult {
  success: boolean;
  runId?: string;
  workflowId: string;
  workflowName?: string;
  rootNodeIds?: string[];
  error?: string;
}

/**
 * Triggers a workflow execution instance initiated by a BullMQ Cron schedule.
 * Persists the run in PostgreSQL and initializes Redis topological state.
 */
export async function executeCronWorkflowTrigger(
  workflowId: string,
  metadata?: Record<string, unknown>
): Promise<CronExecutionResult> {
  try {
    // 1. Fetch active workflow blueprint
    const blueprint = await db.workflowBlueprint.findUnique({
      where: { id: workflowId },
    });

    if (!blueprint) {
      return {
        success: false,
        workflowId,
        error: `Workflow blueprint ${workflowId} not found in database.`,
      };
    }

    if (!blueprint.isActive) {
      return {
        success: false,
        workflowId,
        workflowName: blueprint.name,
        error: `Workflow blueprint "${blueprint.name}" is marked inactive; skipping execution.`,
      };
    }

    // 2. Parse base in-degrees and topology
    const baseIndegrees = (blueprint.baseIndegrees as Record<string, number>) || {};
    const adjacencyMap = (blueprint.adjacencyMap as Record<string, string[]>) || {};
    const nodes = (blueprint.nodesJson as Array<{ id: string; type?: string; data?: unknown }>) || [];

    // 3. Create persistent WorkflowRun record
    const run = await db.workflowRun.create({
      data: {
        workflowId: blueprint.id,
        status: RunStatus.RUNNING,
        triggerType: TriggerSource.CRON,
        triggerPayload: {
          cronExpression: blueprint.cronExpression,
          triggeredAt: new Date().toISOString(),
          ...metadata,
        },
      },
    });

    const runId = run.id;

    // 4. Initialize Redis coordination keys
    // run:{id}:indegree (Hash)
    // run:{id}:outputs (Hash)
    // run:{id}:completed_nodes (Set)
    const pipeline = redis.pipeline();
    const indegreeKey = `run:${runId}:indegree`;
    const outputsKey = `run:${runId}:outputs`;
    const completedKey = `run:${runId}:completed_nodes`;

    // Seed initial in-degree counts in Redis
    const indegreeEntries: [string, number][] = Object.entries(baseIndegrees);
    if (indegreeEntries.length > 0) {
      const hashData: Record<string, number> = {};
      for (const [nodeId, degree] of indegreeEntries) {
        hashData[nodeId] = degree;
      }
      pipeline.hset(indegreeKey, hashData);
    }

    // Initialize root nodes output with trigger payload
    pipeline.hset(
      outputsKey,
      "TRIGGER",
      JSON.stringify({
        cronExpression: blueprint.cronExpression,
        timestamp: new Date().toISOString(),
      })
    );

    // Set expiration on runtime keys (e.g., 24 hours retention)
    pipeline.expire(indegreeKey, 86400);
    pipeline.expire(outputsKey, 86400);
    pipeline.expire(completedKey, 86400);

    await pipeline.exec();

    // 5. Identify root nodes with in-degree == 0
    const rootNodeIds: string[] = [];
    if (indegreeEntries.length > 0) {
      for (const [nodeId, degree] of indegreeEntries) {
        if (Number(degree) === 0) {
          rootNodeIds.push(nodeId);
        }
      }
    } else if (nodes.length > 0) {
      // Fallback if baseIndegrees was empty: first node or trigger node
      rootNodeIds.push(nodes[0].id);
    }

    // 6. Enqueue root nodes into BullMQ for worker execution
    const dagQueue = getDagExecutionQueue();
    for (const nodeId of rootNodeIds) {
      const nodeDef = nodes.find((n) => n.id === nodeId);
      const idempotencyKey = crypto
        .createHash("sha256")
        .update(`${runId}:${nodeId}:1`)
        .digest("hex");

      // Record initial QUEUED log in database
      await db.nodeExecutionLog.create({
        data: {
          runId,
          nodeId,
          idempotencyKey,
          status: NodeExecStatus.QUEUED,
          attemptNumber: 1,
          inputPayload: {
            triggeredBy: "CRON",
            cronExpression: blueprint.cronExpression,
          },
        },
      });

      // Enqueue job into BullMQ DAG worker pool
      await dagQueue.add(
        `exec:${nodeId}`,
        {
          runId,
          workflowId: blueprint.id,
          nodeId,
          nodeType: nodeDef?.type || "CRON_TRIGGER",
          nodeData: nodeDef?.data || {},
          attempt: 1,
          idempotencyKey,
          downstreamNodeIds: adjacencyMap[nodeId] || [],
        },
        {
          jobId: `job_${runId}_${nodeId}_1`,
        }
      );
    }

    // 7. Emit real-time telemetry event via Redis Pub/Sub
    const telemetryEvent = {
      event: "WORKFLOW_TRIGGERED",
      runId,
      workflowId: blueprint.id,
      workflowName: blueprint.name,
      triggerType: "CRON",
      cronExpression: blueprint.cronExpression,
      rootNodeCount: rootNodeIds.length,
      timestamp: new Date().toISOString(),
    };

    await redis.publish(`channel:run:${runId}`, JSON.stringify(telemetryEvent));
    await redis.publish("channel:cluster:events", JSON.stringify(telemetryEvent));

    return {
      success: true,
      runId,
      workflowId: blueprint.id,
      workflowName: blueprint.name,
      rootNodeIds,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[CronTriggerExecutor] Failed to trigger workflow ${workflowId}:`, err);
    return {
      success: false,
      workflowId,
      error: errorMsg,
    };
  }
}
