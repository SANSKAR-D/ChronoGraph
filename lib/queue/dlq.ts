import { Job, MinimalJob } from "bullmq";
import { db as defaultDb } from "../db";
import { redis as defaultRedis } from "../redis/client";
import { getDeadLetterQueue } from "./bullmq";
import { calculateExponentialJitterBackoff } from "./backoff";
import { computeIdempotencyKey } from "../redis/lua-scripts";
import { RunStatus, NodeExecStatus } from "@prisma/client";
import crypto from "crypto";

export interface DAGJobData {
  runId: string;
  workflowId: string;
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  nodeData?: Record<string, unknown>;
  attempt?: number;
  idempotencyKey?: string;
  downstreamNodeIds?: string[];
  triggerPayload?: Record<string, unknown>;
  adjacencyMap?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface DLQRoutingResult {
  isExhausted: boolean;
  dlqRecordId?: string;
  runId?: string;
  workflowId?: string;
  nodeId?: string;
  attemptsMade: number;
  maxAttempts: number;
  haltedDownstreamNodes?: string[];
  error?: string;
}

export interface DLQDependencies {
  dbClient?: any;
  redisClient?: any;
  dlqQueueClient?: any;
}

/**
 * Computes all transitive downstream node IDs (children, grandchildren, etc.)
 * in topological dependency order using Breadth-First Search (BFS).
 *
 * @param adjacencyMap Pre-compiled adjacency dictionary { parentNodeId: [childNodeId1, childNodeId2] }
 * @param startNodeId The failed node ID from which to traverse
 * @returns Array of unique downstream node IDs
 */
export function findAllTransitiveDownstreamNodes(
  adjacencyMap: Record<string, string[]>,
  startNodeId: string
): string[] {
  const visited = new Set<string>();
  const queue: string[] = [...(adjacencyMap[startNodeId] || [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      const children = adjacencyMap[current] || [];
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }
  }

  return Array.from(visited);
}

/**
 * Routes a permanently exhausted failed job into the Dead-Letter Queue (DLQ).
 * 1. Persists failure context to PostgreSQL `dead_letter_jobs` table.
 * 2. Marks failed node log status as `DLQ` in `node_execution_logs`.
 * 3. Identifies and marks downstream dependent nodes as `SKIPPED/HALTED`.
 * 4. Updates workflow run status to `PARTIAL_FAILURE`.
 * 5. Publishes `DLQ_ROUTED` telemetry event to Redis Pub/Sub channels.
 * 6. Enqueues job representation to BullMQ dead-letter queue.
 */
export async function routeJobToDeadLetterQueue(
  job: MinimalJob | Job,
  err: Error,
  deps?: DLQDependencies
): Promise<DLQRoutingResult> {
  const dbClient = deps?.dbClient ?? defaultDb;
  const redisClient = deps?.redisClient ?? defaultRedis;

  const data = (job.data || {}) as DAGJobData;
  const runId = data.runId;
  const workflowId = data.workflowId;
  const nodeId = data.nodeId;
  const attemptsMade = job.attemptsMade ?? 1;
  const maxAttempts = (job.opts as any)?.attempts ?? 1;

  if (!runId || !workflowId || !nodeId) {
    console.warn(`[DLQ] Missing required job coordinates in job ${job.id}`);
    return {
      isExhausted: true,
      attemptsMade,
      maxAttempts,
      error: "Missing runId, workflowId, or nodeId in job data",
    };
  }

  try {
    // 1. Fetch blueprint adjacencyMap to determine downstream dependencies
    let adjacencyMap: Record<string, string[]> = data.adjacencyMap || {};
    if (Object.keys(adjacencyMap).length === 0) {
      try {
        const blueprint = await dbClient.workflowBlueprint.findUnique({
          where: { id: workflowId },
          select: { adjacencyMap: true },
        });
        if (blueprint?.adjacencyMap) {
          adjacencyMap = blueprint.adjacencyMap as Record<string, string[]>;
        }
      } catch (bpErr) {
        console.warn(`[DLQ] Could not load adjacencyMap from DB for ${workflowId}:`, bpErr);
      }
    }

    // 2. Discover all transitive downstream nodes
    let downstreamNodes = findAllTransitiveDownstreamNodes(adjacencyMap, nodeId);
    if (downstreamNodes.length === 0 && Array.isArray(data.downstreamNodeIds)) {
      downstreamNodes = [...data.downstreamNodeIds];
    }

    // 3. Persist DLQ entry to PostgreSQL `dead_letter_jobs` table
    const dlqRecord = await dbClient.deadLetterJob.create({
      data: {
        runId,
        workflowId,
        nodeId,
        userEmail: (data as any)?.userEmail || null,
        failedPayload: {
          jobId: job.id,
          jobName: (job as any).name,
          jobData: data,
          errorStack: err.stack,
          attemptsMade,
          maxAttempts,
          timestamp: new Date().toISOString(),
        },
        lastError: err.message || String(err),
        attemptsMade,
        replayed: false,
        failedAt: new Date(),
      },
    });

    // 4. Update the failed node execution log to DLQ status
    const dlqIdempotencyKey = computeIdempotencyKey(runId, nodeId, attemptsMade);
    await dbClient.nodeExecutionLog.upsert({
      where: { idempotencyKey: dlqIdempotencyKey },
      create: {
        runId,
        nodeId,
        idempotencyKey: dlqIdempotencyKey,
        status: NodeExecStatus.DLQ,
        attemptNumber: attemptsMade,
        errorMessage: err.message,
        inputPayload: data.triggerPayload ?? data.nodeData ?? {},
        outputPayload: {
          error: err.message,
          stack: err.stack,
          dlqRecordId: dlqRecord.id,
        },
      },
      update: {
        status: NodeExecStatus.DLQ,
        errorMessage: err.message,
        outputPayload: {
          error: err.message,
          stack: err.stack,
          dlqRecordId: dlqRecord.id,
        },
      },
    });

    // 5. Mark downstream dependent nodes as SKIPPED/HALTED
    const haltPromises = downstreamNodes.map((childNodeId) => {
      const haltKey = crypto
        .createHash("sha256")
        .update(`${runId}:${childNodeId}:halted:${nodeId}`)
        .digest("hex");

      return dbClient.nodeExecutionLog.upsert({
        where: { idempotencyKey: haltKey },
        create: {
          runId,
          nodeId: childNodeId,
          idempotencyKey: haltKey,
          status: NodeExecStatus.FAILED,
          attemptNumber: 1,
          errorMessage: `SKIPPED/HALTED: Downstream dependency aborted due to upstream node '${nodeId}' exhausting retries and routing to DLQ.`,
          inputPayload: {
            haltedByUpstreamNode: nodeId,
            dlqRecordId: dlqRecord.id,
          },
        },
        update: {
          status: NodeExecStatus.FAILED,
          errorMessage: `SKIPPED/HALTED: Downstream dependency aborted due to upstream node '${nodeId}' exhausting retries and routing to DLQ.`,
        },
      });
    });

    await Promise.all(haltPromises);

    // 6. Update workflow run status to PARTIAL_FAILURE
    await dbClient.workflowRun.update({
      where: { id: runId },
      data: {
        status: RunStatus.PARTIAL_FAILURE,
        completedAt: new Date(),
      },
    });

    // 7. Publish DLQ_ROUTED event to Redis Pub/Sub channels
    const dlqRoutedEvent = {
      event: "DLQ_ROUTED",
      dlqId: dlqRecord.id,
      runId,
      workflowId,
      nodeId,
      jobId: job.id,
      attemptsMade,
      maxAttempts,
      lastError: err.message || String(err),
      failedAt: dlqRecord.failedAt.toISOString(),
      haltedDownstreamNodes: downstreamNodes,
      timestamp: new Date().toISOString(),
    };

    const serializedEvent = JSON.stringify(dlqRoutedEvent);
    await Promise.all([
      redisClient.publish(`channel:run:${runId}`, serializedEvent),
      redisClient.publish("channel:cluster:events", serializedEvent),
      redisClient.publish("channel:dlq:events", serializedEvent),
    ]);

    // 8. Enqueue job into BullMQ dead-letter queue for queue-level inspection
    const targetDlqQueue = deps?.dlqQueueClient ?? getDeadLetterQueue();
    if (targetDlqQueue) {
      await targetDlqQueue.add(
        `dlq:${nodeId}`,
        {
          dlqRecordId: dlqRecord.id,
          runId,
          workflowId,
          nodeId,
          originalJobId: job.id,
          lastError: err.message,
          attemptsMade,
          failedAt: dlqRecord.failedAt.toISOString(),
          haltedDownstreamNodes: downstreamNodes,
        },
        {
          jobId: `dlq_${dlqRecord.id}`,
        }
      );
    }

    return {
      isExhausted: true,
      dlqRecordId: dlqRecord.id,
      runId,
      workflowId,
      nodeId,
      attemptsMade,
      maxAttempts,
      haltedDownstreamNodes: downstreamNodes,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DLQ] Error routing job ${job.id} to DLQ:`, error);
    return {
      isExhausted: true,
      attemptsMade,
      maxAttempts,
      error: errorMsg,
    };
  }
}

/**
 * Central BullMQ `failed` event handler for distributed DAG workers.
 * Distinguishes between:
 * 1. Intermediate failures: emits RETRYING telemetry, logs retry attempt, and calculates next delay.
 * 2. Permanent exhaustion (attemptsMade >= attempts): routes to DLQ and halts downstream nodes.
 */
export async function handleWorkerJobFailure(
  job: MinimalJob | Job,
  err: Error,
  deps?: DLQDependencies
): Promise<DLQRoutingResult> {
  const maxAttempts = (job.opts as any)?.attempts ?? 1;
  const attemptsMade = job.attemptsMade ?? 1;

  // When job.attemptsMade >= job.opts.attempts, all retry attempts are exhausted
  if (attemptsMade >= maxAttempts) {
    return routeJobToDeadLetterQueue(job, err, deps);
  }

  // Job is not exhausted; BullMQ will schedule the next retry with jittered backoff
  const data = (job.data || {}) as DAGJobData;
  const runId = data.runId;
  const nodeId = data.nodeId;

  if (runId && nodeId) {
    const dbClient = deps?.dbClient ?? defaultDb;
    const redisClient = deps?.redisClient ?? defaultRedis;

    const nextRetryDelayMs = calculateExponentialJitterBackoff(attemptsMade, {
      baseMs: data.nodeData?.baseBackoffMs as number | undefined,
      maxCapMs: data.nodeData?.maxBackoffCapMs as number | undefined,
    });

    try {
      // Record RETRYING log in node_execution_logs
      const retryIdempotencyKey = computeIdempotencyKey(runId, nodeId, attemptsMade);
      await dbClient.nodeExecutionLog.upsert({
        where: { idempotencyKey: retryIdempotencyKey },
        create: {
          runId,
          nodeId,
          idempotencyKey: retryIdempotencyKey,
          status: NodeExecStatus.RETRYING,
          attemptNumber: attemptsMade,
          errorMessage: err.message,
          inputPayload: data.triggerPayload ?? data.nodeData ?? {},
          outputPayload: {
            error: err.message,
            nextRetryDelayMs,
            nextAttempt: attemptsMade + 1,
            maxAttempts,
          },
        },
        update: {
          status: NodeExecStatus.RETRYING,
          errorMessage: err.message,
          outputPayload: {
            error: err.message,
            nextRetryDelayMs,
            nextAttempt: attemptsMade + 1,
            maxAttempts,
          },
        },
      });

      // Emit NODE_STATE_CHANGE event with status: RETRYING
      const retryEvent = {
        event: "NODE_STATE_CHANGE",
        runId,
        nodeId,
        nodeName: (data as any)?.nodeName || (data?.nodeData as any)?.name || nodeId,
        nodeType: (data as any)?.nodeType,
        status: "RETRYING",
        attempt: attemptsMade,
        maxAttempts,
        errorMessage: err.message,
        nextRetryDelayMs,
        timestamp: new Date().toISOString(),
      };

      await redisClient.publish(`channel:run:${runId}`, JSON.stringify(retryEvent));
    } catch (logErr) {
      console.warn(`[DLQ] Failed to record intermediate retry log for ${nodeId}:`, logErr);
    }
  }

  return {
    isExhausted: false,
    runId,
    workflowId: data.workflowId,
    nodeId,
    attemptsMade,
    maxAttempts,
  };
}
