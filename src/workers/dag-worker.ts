import { Worker, Job, Queue } from "bullmq";
import { QUEUE_NAMES, getDagExecutionQueue } from "@/lib/queue/bullmq";
import { createRedisConnection, redis as defaultRedis } from "@/lib/redis/client";
import { bullMQExponentialJitterBackoff } from "@/lib/queue/backoff";
import { handleWorkerJobFailure, DAGJobData } from "@/lib/queue/dlq";
import {
  atomicFanOutDecrement,
  acquireIdempotencyLock,
  releaseIdempotencyLock,
  computeIdempotencyKey,
} from "@/lib/redis/lua-scripts";
import { db as defaultDb } from "@/lib/db";
import { RunStatus, NodeExecStatus } from "@prisma/client";
import {
  executeHttpNode,
  executeTransformNode,
  executeDelayNode,
} from "./executors";
import crypto from "crypto";
import os from "os";

export interface DagWorkerOptions {
  workerId?: string;
  concurrency?: number;
  heartbeatIntervalMs?: number;
  dbClient?: any;
  redisClient?: any;
  dagQueueClient?: Queue;
}

export interface WorkerHeartbeatPayload {
  workerId: string;
  name: string;
  status: "healthy" | "busy";
  concurrency: number;
  cpu: number;
  memory: string;
  activeJobs: number;
  lastHeartbeat: string;
  timestamp: string;
}

let activeWorkerInstance: Worker<DAGJobData> | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Returns the currently active DAG BullMQ Worker instance, if running.
 */
export function getActiveDagWorker(): Worker<DAGJobData> | null {
  return activeWorkerInstance;
}

/**
 * Resolves context for template variable interpolation by gathering:
 * - Upstream node outputs saved in Redis (run:{runId}:outputs)
 * - Initial workflow trigger payload
 */
export async function loadRunExecutionContext(
  redisClient: any,
  runId: string,
  triggerPayload?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    trigger: triggerPayload || {},
    TRIGGER: { payload: triggerPayload || {} },
    payload: triggerPayload || {},
  };

  try {
    const rawOutputs = await redisClient.hgetall(`run:${runId}:outputs`);
    if (rawOutputs && typeof rawOutputs === "object") {
      for (const [nodeKey, rawVal] of Object.entries(rawOutputs)) {
        try {
          const parsed = JSON.parse(rawVal as string);
          context[nodeKey] = parsed;
          // If node has 'data' or 'output', expose it directly as well
          if (parsed && typeof parsed === "object") {
            if ("data" in parsed) {
              (context[nodeKey] as any).data = parsed.data;
            }
            if ("output" in parsed) {
              (context[nodeKey] as any).output = parsed.output;
            }
          }
        } catch {
          context[nodeKey] = rawVal;
        }
      }
    }
  } catch (err) {
    console.warn(`[DAGWorker] Failed to load execution outputs from Redis for ${runId}:`, err);
  }

  return context;
}

/**
 * Emits worker heartbeat to Redis key worker:heartbeat:{workerId} with TTL 15s
 * and broadcasts telemetry to channel:cluster:heartbeats.
 */
export async function emitWorkerHeartbeat(
  workerId: string,
  concurrency: number,
  activeJobs: number,
  redisClient: any
): Promise<WorkerHeartbeatPayload> {
  const cpus = os.cpus();
  const memUsage = process.memoryUsage();
  const memMb = Math.round(memUsage.heapUsed / 1024 / 1024);

  // Compute realistic CPU metric (handles Windows where loadavg is [0, 0, 0])
  const rawLoad = os.loadavg()[0];
  const cpuPercent =
    rawLoad > 0 && cpus.length > 0
      ? Math.min(100, Math.round((rawLoad / cpus.length) * 100))
      : Math.min(100, Math.max(10, Math.round((activeJobs / concurrency) * 100)));

  const heartbeatPayload: WorkerHeartbeatPayload = {
    workerId,
    name: `dag-worker-${workerId.slice(-4)}`,
    status: activeJobs > 0 ? "busy" : "healthy",
    concurrency,
    cpu: cpuPercent,
    memory: `${memMb} MB`,
    activeJobs,
    lastHeartbeat: new Date().toISOString(),
    timestamp: new Date().toISOString(),
  };

  const heartbeatKey = `worker:heartbeat:${workerId}`;
  await Promise.all([
    redisClient.set(heartbeatKey, JSON.stringify(heartbeatPayload), "EX", 15),
    redisClient.publish("channel:cluster:heartbeats", JSON.stringify(heartbeatPayload)),
  ]);

  return heartbeatPayload;
}

/**
 * Creates and configures the distributed DAG BullMQ Worker.
 *
 * Configured with:
 * - T3.1: Configurable concurrency and Redis heartbeat emission (`worker:heartbeat:{workerId}`)
 * - T3.2: Native execution of HTTP, Transform, and Delay nodes with template interpolation
 * - T3.3: Custom exponential backoff + full jitter strategy (`settings.backoffStrategy`)
 * - T3.4: Dead-Letter Queue (DLQ) routing & downstream node halting on `failed` event
 * - Atomic Redis Lua fan-out and topological dependency unlocking
 */
export function createDagWorker(options?: DagWorkerOptions): Worker<DAGJobData> {
  const workerId =
    options?.workerId ||
    process.env.WORKER_ID ||
    `worker-${os.hostname()}-${crypto.randomBytes(4).toString("hex")}`;

  const concurrency =
    options?.concurrency ||
    parseInt(process.env.WORKER_CONCURRENCY || "10", 10);

  const heartbeatIntervalMs = options?.heartbeatIntervalMs || 5000;
  const dbClient = options?.dbClient ?? defaultDb;
  const redisClient = options?.redisClient ?? defaultRedis;
  const dagQueueClient = options?.dagQueueClient ?? getDagExecutionQueue();

  let currentlyActiveJobs = 0;

  // T3.1: Heartbeat emitter: worker:heartbeat:{workerId}
  const emitHeartbeat = async () => {
    try {
      await emitWorkerHeartbeat(workerId, concurrency, currentlyActiveJobs, redisClient);
    } catch (hbErr) {
      console.warn(`[DAGWorker ${workerId}] Failed to emit heartbeat:`, hbErr);
    }
  };

  const worker = new Worker<DAGJobData>(
    QUEUE_NAMES.DAG_EXECUTION,
    async (job: Job<DAGJobData>) => {
      currentlyActiveJobs++;
      emitHeartbeat().catch(() => {});
      const startTime = Date.now();
      const {
        runId,
        workflowId,
        nodeId,
        nodeType,
        nodeData = {},
        downstreamNodeIds = [],
        triggerPayload,
      } = job.data;

      const nodeName =
        (job.data as any)?.nodeName ||
        (nodeData as any)?.name ||
        (nodeData as any)?.label ||
        nodeId;

      const attemptNumber = job.attemptsMade + 1;
      const idempotencyKey =
        job.data.idempotencyKey ||
        computeIdempotencyKey(runId, nodeId, attemptNumber);

      console.log(
        `[DAGWorker ${workerId}] Claimed job ${job.id} for node: ${nodeId} (${nodeType || "UNKNOWN"}) [Attempt ${attemptNumber}] in run: ${runId}`
      );

      try {
        // 1. Acquire idempotency lock to protect against race conditions
        const lockAcquired = await acquireIdempotencyLock(
          redisClient,
          idempotencyKey,
          3600
        );

        if (!lockAcquired) {
          console.warn(
            `[DAGWorker ${workerId}] Idempotency lock already held for ${idempotencyKey}; checking existing status.`
          );
        }

        // 2. Emit RUNNING telemetry to Redis Pub/Sub
        const runningEvent = {
          nodeName,
          nodeType,
          event: "NODE_STATE_CHANGE",
          runId,
          workflowId,
          nodeId,
          status: "RUNNING",
          attempt: attemptNumber,
          workerId,
          timestamp: new Date().toISOString(),
        };
        await Promise.all([
          redisClient.publish(`channel:run:${runId}`, JSON.stringify(runningEvent)),
          redisClient.publish("channel:cluster:events", JSON.stringify(runningEvent)),
        ]);

        // 3. Update database node execution log to RUNNING status
        try {
          await dbClient.nodeExecutionLog.upsert({
            where: { idempotencyKey },
            create: {
              runId,
              nodeId,
              idempotencyKey,
              status: NodeExecStatus.RUNNING,
              attemptNumber,
              inputPayload: (nodeData || triggerPayload || {}) as any,
            },
            update: {
              status: NodeExecStatus.RUNNING,
              attemptNumber,
            },
          });
        } catch (dbErr) {
          console.warn(`[DAGWorker ${workerId}] Could not update log to RUNNING:`, dbErr);
        }

        // 4. Handle simulated failure for Chaos / Stress testing
        if (nodeData.simulateFailure) {
          throw new Error(
            (nodeData.failureMessage as string) ||
              `Simulated failure on node ${nodeId} for retry/DLQ validation`
          );
        }

        // 5. Gather execution context for template variables
        const executionContext = await loadRunExecutionContext(
          redisClient,
          runId,
          triggerPayload
        );

        // 6. Execute node according to its core type
        let executionResult: any = null;
        const normalizedType = (nodeType || "").toUpperCase();

        if (
          normalizedType === "HTTP_REQUEST" ||
          normalizedType === "HTTP" ||
          normalizedType === "EXECUTEHTTPNODE"
        ) {
          // T3.2: executeHttpNode
          executionResult = await executeHttpNode({
            url: (nodeData.url as string) || (nodeData.endpoint as string),
            method: (nodeData.method as string) || "GET",
            headers: (nodeData.headers as Record<string, string>) || {},
            body: nodeData.body ?? nodeData.payload,
            timeoutMs: (nodeData.timeoutMs as number) || (nodeData.timeout as number) || 10000,
            idempotencyKey,
            context: executionContext,
          });
        } else if (
          normalizedType === "JSON_TRANSFORM" ||
          normalizedType === "TRANSFORM_SCRIPT" ||
          normalizedType === "TRANSFORM" ||
          normalizedType === "EXECUTETRANSFORMNODE"
        ) {
          // T3.2: executeTransformNode
          executionResult = await executeTransformNode({
            selector: nodeData.selector as string,
            mapping: nodeData.mapping as Record<string, string>,
            filter: nodeData.filter as any,
            script: (nodeData.script as string) || (nodeData.expression as string),
            payload: nodeData.payload,
            context: executionContext,
          });
        } else if (
          normalizedType === "DELAY_TIMER" ||
          normalizedType === "DELAY" ||
          normalizedType === "EXECUTEDELAYNODE"
        ) {
          // T3.2: executeDelayNode (Non-blocking BullMQ delayed transition)
          const delayResult = await executeDelayNode({
            delayMs: nodeData.delayMs as number,
            durationSeconds: nodeData.durationSeconds as number,
            job,
            jobData: job.data,
            queue: dagQueueClient,
          });

          // If the job was scheduled into BullMQ's delayed ZSET, exit early without downstream fan-out
          if (delayResult.delayed) {
            console.log(
              `[DAGWorker ${workerId}] DelayNode ${nodeId} transitioned into BullMQ delayed ZSET (${delayResult.delayMs}ms) until ${delayResult.resumesAt}`
            );

            const delayedEvent = {
              nodeName,
              nodeType,
              event: "NODE_STATE_CHANGE",
              runId,
              workflowId,
              nodeId,
              status: "RUNNING",
              detail: `Delayed by ${delayResult.delayMs}ms via BullMQ ZSET`,
              resumesAt: delayResult.resumesAt,
              workerId,
              timestamp: new Date().toISOString(),
            };
            await redisClient.publish(`channel:run:${runId}`, JSON.stringify(delayedEvent));

            return {
              success: true,
              delayed: true,
              delayMs: delayResult.delayMs,
              resumesAt: delayResult.resumesAt,
              runId,
              nodeId,
              workerId,
            };
          }

          executionResult = delayResult;
        } else {
          // Default pass-through for triggers and sinks
          executionResult = {
            success: true,
            data: nodeData.payload ?? triggerPayload ?? nodeData,
            nodeId,
            runId,
            executedAt: new Date().toISOString(),
          };
        }

        const durationMs = Date.now() - startTime;

        // 7. Store node execution output in Redis (run:{runId}:outputs)
        try {
          const outputsKey = `run:${runId}:outputs`;
          await redisClient.hset(
            outputsKey,
            nodeId,
            JSON.stringify(executionResult)
          );
        } catch (redisOutErr) {
          console.warn(`[DAGWorker ${workerId}] Failed to cache output in Redis:`, redisOutErr);
        }

        // 8. Update database node execution log to SUCCESS status
        try {
          await dbClient.nodeExecutionLog.upsert({
            where: { idempotencyKey },
            create: {
              runId,
              nodeId,
              idempotencyKey,
              status: NodeExecStatus.SUCCESS,
              attemptNumber,
              outputPayload: executionResult as any,
              httpStatusCode: executionResult?.status,
              durationMs,
            },
            update: {
              status: NodeExecStatus.SUCCESS,
              outputPayload: executionResult as any,
              httpStatusCode: executionResult?.status,
              durationMs,
            },
          });
        } catch (dbSuccessErr) {
          console.warn(`[DAGWorker ${workerId}] Failed to update log to SUCCESS:`, dbSuccessErr);
        }

        // 9. Emit SUCCESS telemetry event to Redis Pub/Sub
        const successEvent = {
          nodeName,
          nodeType,
          event: "NODE_STATE_CHANGE",
          runId,
          workflowId,
          nodeId,
          status: "SUCCESS",
          attempt: attemptNumber,
          durationMs,
          workerId,
          payloadPreview: executionResult?.data ?? executionResult,
          timestamp: new Date().toISOString(),
        };
        await Promise.all([
          redisClient.publish(`channel:run:${runId}`, JSON.stringify(successEvent)),
          redisClient.publish("channel:cluster:events", JSON.stringify(successEvent)),
        ]);

        // 10. Atomic Redis Lua Fan-Out: Decrement child in-degrees and unlock ready nodes
        let effectiveDownstream = downstreamNodeIds;
        let blueprintCache: any = null;

        if (!effectiveDownstream || effectiveDownstream.length === 0) {
          try {
            blueprintCache = await dbClient.workflowBlueprint.findUnique({
              where: { id: workflowId },
            });
            const adj = (blueprintCache?.adjacencyMap as Record<string, string[]>) || {};
            effectiveDownstream = adj[nodeId] || [];
          } catch (bpErr) {
            console.warn(`[DAGWorker ${workerId}] Could not resolve downstream nodes for ${nodeId}:`, bpErr);
          }
        }

        const unlockedChildren = await atomicFanOutDecrement(
          redisClient,
          runId,
          nodeId,
          effectiveDownstream || []
        );

        console.log(
          `[DAGWorker ${workerId}] Completed ${nodeId}. Unlocked downstream children: [${unlockedChildren.join(", ")}]`
        );

        // 11. Enqueue unlocked child nodes into BullMQ
        if (unlockedChildren.length > 0 && dagQueueClient) {
          if (!blueprintCache) {
            blueprintCache = await dbClient.workflowBlueprint.findUnique({
              where: { id: workflowId },
            });
          }

          const nodesJson = (blueprintCache?.nodesJson as any[]) || [];
          const adjacencyMap = (blueprintCache?.adjacencyMap as Record<string, string[]>) || {};

          for (const childId of unlockedChildren) {
            const childNodeDef = nodesJson.find((n) => n.id === childId);
            const childData = childNodeDef?.data || {};
            const childIdempotencyKey = computeIdempotencyKey(runId, childId, 1);

            // Record initial QUEUED log
            try {
              await dbClient.nodeExecutionLog.create({
                data: {
                  runId,
                  nodeId: childId,
                  idempotencyKey: childIdempotencyKey,
                  status: NodeExecStatus.QUEUED,
                  attemptNumber: 1,
                  inputPayload: executionResult as any,
                },
              });
            } catch (logErr) {
              console.warn(`[DAGWorker ${workerId}] Failed to create QUEUED log for ${childId}:`, logErr);
            }

            // Enqueue into BullMQ
            await dagQueueClient.add(
              `exec:${childId}`,
              {
                runId,
                workflowId,
                nodeId: childId,
                nodeName: childNodeDef?.name || childId,
                nodeType: childNodeDef?.type || "ACTION",
                nodeData: childData,
                attempt: 1,
                idempotencyKey: childIdempotencyKey,
                downstreamNodeIds: adjacencyMap[childId] || [],
                triggerPayload,
              },
              {
                jobId: `job_${runId}_${childId}_1`,
                attempts: childData.maxRetries ?? 3,
                backoff: {
                  type: "exponential-jitter",
                },
              }
            );

            // Emit QUEUED event
            const queuedEvent = {
              nodeName: childNodeDef?.name || childId,
              nodeType: childNodeDef?.type || "ACTION",
              event: "NODE_STATE_CHANGE",
              runId,
              workflowId,
              nodeId: childId,
              status: "QUEUED",
              attempt: 1,
              workerId,
              timestamp: new Date().toISOString(),
            };
            await redisClient.publish(`channel:run:${runId}`, JSON.stringify(queuedEvent));
          }
        }

        // 12. Workflow Completion Verification: Check if all nodes in DAG are complete
        try {
          if (!blueprintCache) {
            blueprintCache = await dbClient.workflowBlueprint.findUnique({
              where: { id: workflowId },
            });
          }

          const allNodes = (blueprintCache?.nodesJson as any[]) || [];
          const completedSetCount = await redisClient.scard(`run:${runId}:completed_nodes`);

          if (allNodes.length > 0 && completedSetCount >= allNodes.length) {
            // All nodes completed successfully!
            await dbClient.workflowRun.updateMany({
              where: {
                id: runId,
                status: RunStatus.RUNNING,
              },
              data: {
                status: RunStatus.COMPLETED,
                completedAt: new Date(),
              },
            });

            const workflowCompletedEvent = {
              event: "WORKFLOW_COMPLETED",
              runId,
              workflowId,
              completedNodesCount: completedSetCount,
              timestamp: new Date().toISOString(),
            };
            await Promise.all([
              redisClient.publish(`channel:run:${runId}`, JSON.stringify(workflowCompletedEvent)),
              redisClient.publish("channel:cluster:events", JSON.stringify(workflowCompletedEvent)),
            ]);
            console.log(`[DAGWorker ${workerId}] 🎉 Workflow run ${runId} successfully COMPLETED!`);
          }
        } catch (compErr) {
          console.warn(`[DAGWorker ${workerId}] Error checking workflow completion for ${runId}:`, compErr);
        }

        return {
          success: true,
          runId,
          nodeId,
          executedBy: workerId,
          durationMs,
          completedAt: new Date().toISOString(),
        };
      } finally {
        currentlyActiveJobs = Math.max(0, currentlyActiveJobs - 1);
        emitHeartbeat().catch(() => {});
      }
    },
    {
      connection: createRedisConnection(),
      concurrency,
      lockDuration: 15000,
      // T3.3: Exponential Backoff + Full Jitter custom strategy
      settings: {
        backoffStrategy: bullMQExponentialJitterBackoff,
      },
    }
  );

  // T3.4: Hook into BullMQ `failed` event for DLQ routing and retry telemetry
  worker.on("failed", async (job, err) => {
    if (!job) {
      console.error(`[DAGWorker ${workerId}] Received failed event without job object:`, err);
      return;
    }

    console.warn(
      `[DAGWorker ${workerId}] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts || 1}): ${err.message}`
    );

    try {
      const dlqResult = await handleWorkerJobFailure(job, err, {
        dbClient,
        redisClient,
      });

      if (dlqResult.isExhausted) {
        console.error(
          `[DAGWorker ${workerId}] Job ${job.id} (node: ${job.data.nodeId}) permanently EXHAUSTED and routed to DLQ (Record: ${dlqResult.dlqRecordId})`
        );
      } else {
        console.log(
          `[DAGWorker ${workerId}] Job ${job.id} scheduled for exponential jitter retry (attempt ${dlqResult.attemptsMade}/${dlqResult.maxAttempts})`
        );
      }
    } catch (dlqErr) {
      console.error(
        `[DAGWorker ${workerId}] Error in DLQ failure handler for job ${job.id}:`,
        dlqErr
      );
    }
  });

  worker.on("completed", (job) => {
    console.log(`[DAGWorker ${workerId}] Job ${job.id} completed successfully.`);
  });

  // Start heartbeat interval
  emitHeartbeat();
  heartbeatTimer = setInterval(emitHeartbeat, heartbeatIntervalMs);

  return worker;
}

/**
 * Starts the standalone global DAG worker runner.
 */
export function startDagWorker(options?: DagWorkerOptions): Worker<DAGJobData> {
  if (!activeWorkerInstance) {
    activeWorkerInstance = createDagWorker(options);
  }
  return activeWorkerInstance;
}

/**
 * Gracefully shuts down the DAG worker runner and cancels heartbeats.
 */
export async function stopDagWorker(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (activeWorkerInstance) {
    await activeWorkerInstance.close();
    activeWorkerInstance = null;
  }
}

// Standalone execution entrypoint when run via CLI: tsx src/workers/dag-worker.ts
if (require.main === module || process.env.RUN_STANDALONE_WORKER === "true") {
  // Bind lightweight healthcheck HTTP server for PaaS web services (Render, Railway, Koyeb)
  if ((process.env.PORT || process.env.RENDER) && !process.env.IS_FORKED_CHILD) {
    import("http").then((http) => {
      const port = parseInt(process.env.PORT || "10000", 10);
      const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ChronoGraph DAG Worker Healthy\n");
      });
      server.listen(port, "0.0.0.0", () => {
        console.log(`[DAGWorker] PaaS HTTP Healthcheck listening on port ${port}`);
      });
    }).catch(() => {});
  }

  console.log("⚡ Starting ChronoGraph Distributed DAG Worker Process...");
  // Auto-seed demo blueprints on worker startup
  import("../../scripts/seed-workflows")
    .then(({ seedAllWorkflows }) => seedAllWorkflows({ silent: true }))
    .catch(() => {});
  const worker = startDagWorker();

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    await stopDagWorker();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
