import { db as defaultDb } from "@/lib/db";
import { redis as defaultRedis } from "@/lib/redis/client";
import {
  getDagExecutionQueue,
  getCronQueue,
  getDeadLetterQueue,
} from "@/lib/queue/bullmq";
import { WorkerHeartbeatPayload } from "@/src/workers/dag-worker";

export interface QueueCountMetrics {
  waiting: number;
  active: number;
  delayed: number;
  dlq: number;
  failed: number;
  completed: number;
  // Aliases for explicit adherence to T4.3 specification: (Waiting, Active, Delayed, DLQ)
  Waiting: number;
  Active: number;
  Delayed: number;
  DLQ: number;
}

export interface ClusterHealthDependencies {
  dbClient?: any;
  redisClient?: any;
  dagQueue?: any;
  cronQueue?: any;
  dlqQueue?: any;
}

export interface ClusterHealthResult {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  activeWorkerCount: number;
  activeWorkers: number;
  heartbeatTimestamps: Record<string, string>;
  workers: WorkerHeartbeatPayload[];
  queueMetrics: QueueCountMetrics;
  queues: {
    dagExecution: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      completed: number;
    };
    cronTriggers: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    };
    deadLetter: {
      queue: {
        waiting: number;
        active: number;
        failed: number;
      };
      database: {
        totalRecords: number;
        unresolved: number;
      };
    };
  };
  redis: {
    status: "connected" | "disconnected" | "error";
    ping?: string;
    error?: string;
  };
  database: {
    status: "connected" | "disconnected" | "error";
    activeRuns?: number;
    error?: string;
  };
}

/**
 * Aggregates cluster-wide telemetry including active worker heartbeat counts,
 * heartbeat timestamps, BullMQ queue depths, and dead-letter queue metrics.
 *
 * Implements T4.3 (Cluster Telemetry Endpoint) specification.
 */
export async function getClusterHealth(
  deps?: ClusterHealthDependencies
): Promise<ClusterHealthResult> {
  const dbClient = deps?.dbClient ?? defaultDb;
  const redisClient = deps?.redisClient ?? defaultRedis;
  const dagQueue = deps?.dagQueue ?? getDagExecutionQueue();
  const cronQueue = deps?.cronQueue ?? getCronQueue();
  const dlqQueue = deps?.dlqQueue ?? getDeadLetterQueue();

  const now = new Date().toISOString();
  let redisStatus: "connected" | "disconnected" | "error" = "connected";
  let redisPing: string | undefined = undefined;
  let redisError: string | undefined = undefined;

  let dbStatus: "connected" | "disconnected" | "error" = "connected";
  let dbActiveRuns = 0;
  let dbError: string | undefined = undefined;

  // 1. Verify Redis connectivity & gather worker heartbeats
  const workers: WorkerHeartbeatPayload[] = [];
  const heartbeatTimestamps: Record<string, string> = {};

  try {
    redisPing = await redisClient.ping();
    const workerKeys: string[] = await redisClient.keys("worker:heartbeat:*");

    if (workerKeys && workerKeys.length > 0) {
      const rawPayloads: (string | null)[] = await redisClient.mget(...workerKeys);
      for (const raw of rawPayloads) {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as WorkerHeartbeatPayload;
            workers.push(parsed);
            heartbeatTimestamps[parsed.workerId] =
              parsed.lastHeartbeat || parsed.timestamp || now;
          } catch {
            // Ignore malformed individual entries
          }
        }
      }
    }
  } catch (err: unknown) {
    redisStatus = "error";
    redisError = err instanceof Error ? err.message : String(err);
  }

  // 2. Query BullMQ Queue Job Counts
  let dagCounts = { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
  let cronCounts = { waiting: 0, active: 0, delayed: 0, failed: 0 };
  let dlqQueueCounts = { waiting: 0, active: 0, failed: 0 };

  try {
    dagCounts = await dagQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed"
    );
  } catch (err) {
    console.warn("[ClusterHealth] Failed to get DAG queue counts:", err);
  }

  try {
    cronCounts = await cronQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
  } catch (err) {
    console.warn("[ClusterHealth] Failed to get Cron queue counts:", err);
  }

  try {
    dlqQueueCounts = await dlqQueue.getJobCounts("waiting", "active", "failed");
  } catch (err) {
    console.warn("[ClusterHealth] Failed to get DLQ queue counts:", err);
  }

  // 3. Database Health & DLQ Persistent Records
  let dlqDbTotal = 0;
  let dlqDbUnresolved = 0;

  try {
    const [totalDlq, unresolvedDlq, activeRuns] = await Promise.all([
      dbClient.deadLetterJob?.count ? dbClient.deadLetterJob.count() : 0,
      dbClient.deadLetterJob?.count
        ? dbClient.deadLetterJob.count({ where: { replayed: false } })
        : 0,
      dbClient.workflowRun?.count
        ? dbClient.workflowRun.count({ where: { status: "RUNNING" } })
        : 0,
    ]);

    dlqDbTotal = totalDlq;
    dlqDbUnresolved = unresolvedDlq;
    dbActiveRuns = activeRuns;
  } catch (err: unknown) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : String(err);
  }

  // 4. Compute Aggregate Metrics
  const totalWaiting = (dagCounts.waiting || 0) + (cronCounts.waiting || 0);
  const totalActive = (dagCounts.active || 0) + (cronCounts.active || 0);
  const totalDelayed = (dagCounts.delayed || 0) + (cronCounts.delayed || 0);
  const totalDlq =
    (dlqQueueCounts.waiting || 0) +
    (dlqQueueCounts.active || 0) +
    dlqDbUnresolved;
  const totalFailed = (dagCounts.failed || 0) + (cronCounts.failed || 0);
  const totalCompleted = dagCounts.completed || 0;

  const queueMetrics: QueueCountMetrics = {
    waiting: totalWaiting,
    active: totalActive,
    delayed: totalDelayed,
    dlq: totalDlq,
    failed: totalFailed,
    completed: totalCompleted,
    // Aliases
    Waiting: totalWaiting,
    Active: totalActive,
    Delayed: totalDelayed,
    DLQ: totalDlq,
  };

  // 5. Determine Overall Cluster Health Status
  let overallStatus: "healthy" | "degraded" | "down" = "healthy";
  if (redisStatus === "error" || dbStatus === "error") {
    overallStatus = "down";
  } else if (
    totalDlq > 0 ||
    (totalWaiting > 0 && workers.length === 0)
  ) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: now,
    activeWorkerCount: workers.length,
    activeWorkers: workers.length,
    heartbeatTimestamps,
    workers,
    queueMetrics,
    queues: {
      dagExecution: {
        waiting: dagCounts.waiting || 0,
        active: dagCounts.active || 0,
        delayed: dagCounts.delayed || 0,
        failed: dagCounts.failed || 0,
        completed: dagCounts.completed || 0,
      },
      cronTriggers: {
        waiting: cronCounts.waiting || 0,
        active: cronCounts.active || 0,
        delayed: cronCounts.delayed || 0,
        failed: cronCounts.failed || 0,
      },
      deadLetter: {
        queue: {
          waiting: dlqQueueCounts.waiting || 0,
          active: dlqQueueCounts.active || 0,
          failed: dlqQueueCounts.failed || 0,
        },
        database: {
          totalRecords: dlqDbTotal,
          unresolved: dlqDbUnresolved,
        },
      },
    },
    redis: {
      status: redisStatus,
      ...(redisPing ? { ping: redisPing } : {}),
      ...(redisError ? { error: redisError } : {}),
    },
    database: {
      status: dbStatus,
      activeRuns: dbActiveRuns,
      ...(dbError ? { error: dbError } : {}),
    },
  };
}
