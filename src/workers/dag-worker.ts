import { Worker, Job } from "bullmq";
import { QUEUE_NAMES } from "@/lib/queue/bullmq";
import { createRedisConnection, redis } from "@/lib/redis/client";
import { bullMQExponentialJitterBackoff } from "@/lib/queue/backoff";
import { handleWorkerJobFailure, DAGJobData } from "@/lib/queue/dlq";
import crypto from "crypto";
import os from "os";

export interface DagWorkerOptions {
  workerId?: string;
  concurrency?: number;
  heartbeatIntervalMs?: number;
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
 * Creates and configures the distributed DAG BullMQ Worker.
 *
 * Configured with:
 * - T3.3: Custom exponential backoff + full jitter strategy (`settings.backoffStrategy`)
 * - T3.4: Dead-Letter Queue (DLQ) routing & downstream node halting on `failed` event
 * - Configurable concurrency and Redis heartbeat emission (`worker:heartbeat:{workerId}`)
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

  let currentlyActiveJobs = 0;

  const worker = new Worker<DAGJobData>(
    QUEUE_NAMES.DAG_EXECUTION,
    async (job: Job<DAGJobData>) => {
      currentlyActiveJobs++;
      const { runId, nodeId, nodeType } = job.data;
      console.log(
        `[DAGWorker ${workerId}] Claimed job ${job.id} for node: ${nodeId} (${nodeType || "UNKNOWN"}) in run: ${runId}`
      );

      try {
        // Emit RUNNING telemetry
        const runningEvent = {
          event: "NODE_STATE_CHANGE",
          runId,
          nodeId,
          status: "RUNNING",
          attempt: job.attemptsMade + 1,
          workerId,
          timestamp: new Date().toISOString(),
        };
        await redis.publish(`channel:run:${runId}`, JSON.stringify(runningEvent));

        // Note: Node-specific execution logic (HTTP, Transform, Delay) is handled by T3.2 executors.
        // If simulation/mock or test execution is provided in nodeData, resolve it:
        const nodeData = job.data.nodeData || {};
        if (nodeData.simulateFailure) {
          throw new Error(
            (nodeData.failureMessage as string) ||
              `Simulated failure on node ${nodeId} for retry/DLQ validation`
          );
        }

        return {
          success: true,
          runId,
          nodeId,
          executedBy: workerId,
          completedAt: new Date().toISOString(),
        };
      } finally {
        currentlyActiveJobs = Math.max(0, currentlyActiveJobs - 1);
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
      const dlqResult = await handleWorkerJobFailure(job, err);
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

  // Heartbeat emitter: worker:heartbeat:{workerId}
  const emitHeartbeat = async () => {
    try {
      const cpus = os.cpus();
      const memUsage = process.memoryUsage();
      const memMb = Math.round(memUsage.heapUsed / 1024 / 1024);

      const heartbeatPayload: WorkerHeartbeatPayload = {
        workerId,
        name: `dag-worker-${workerId.slice(-4)}`,
        status: currentlyActiveJobs >= concurrency ? "busy" : "healthy",
        concurrency,
        cpu: Math.min(100, Math.round(cpus.length > 0 ? (os.loadavg()[0] / cpus.length) * 100 : 20)),
        memory: `${memMb} MB`,
        activeJobs: currentlyActiveJobs,
        lastHeartbeat: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      const heartbeatKey = `worker:heartbeat:${workerId}`;
      await redis.set(heartbeatKey, JSON.stringify(heartbeatPayload), "EX", 15);
      await redis.publish("channel:cluster:heartbeats", JSON.stringify(heartbeatPayload));
    } catch (hbErr) {
      console.warn(`[DAGWorker ${workerId}] Failed to emit heartbeat:`, hbErr);
    }
  };

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
  console.log("⚡ Starting ChronoGraph Distributed DAG Worker...");
  const worker = startDagWorker();

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    await stopDagWorker();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
