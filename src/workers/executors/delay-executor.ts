import { Job, Queue } from "bullmq";
import { DAGJobData } from "@/lib/queue/dlq";
import { getDagExecutionQueue } from "@/lib/queue/bullmq";

export interface DelayNodeOptions {
  delayMs?: number;
  durationSeconds?: number;
  job?: Job<DAGJobData>;
  queue?: Queue;
  jobData?: DAGJobData;
  fallbackWait?: boolean;
}

export interface DelayNodeResult {
  delayed: boolean;
  completed: boolean;
  delayMs: number;
  resumesAt?: string;
  delayedJobId?: string;
  nodeId?: string;
  runId?: string;
}

/**
 * Executes a non-blocking BullMQ delay node transition.
 *
 * Rather than blocking a worker thread with synchronous `sleep(ms)`:
 * 1. Checks if the job was already delayed and has resumed (`isDelayCompleted == true`).
 * 2. If not, schedules a delayed job in BullMQ using Redis ZSETs with `{ delay: delayMs }`.
 * 3. Returns immediately with `delayed: true` so the worker concurrency slot is instantly freed.
 * 4. When the delay elapses in Redis, BullMQ delivers the resumed job with `isDelayCompleted: true`
 *    which safely triggers the downstream DAG fan-out.
 */
export async function executeDelayNode(
  options: DelayNodeOptions
): Promise<DelayNodeResult> {
  const job = options.job;
  const jobData = (options.jobData || job?.data || {}) as DAGJobData;
  const nodeId = jobData.nodeId || "unknown_node";
  const runId = jobData.runId || "unknown_run";

  // Parse numeric values (numbers or numeric strings) safely
  const parseNum = (v: unknown): number | null => {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const parsed = Number(v.trim());
      if (!isNaN(parsed)) return parsed;
    }
    return null;
  };

  const rawDelayMs =
    parseNum(options.delayMs) ??
    parseNum(jobData.nodeData?.delayMs) ??
    parseNum(jobData.nodeData?.delay);

  const rawSeconds =
    parseNum(options.durationSeconds) ??
    parseNum(jobData.nodeData?.durationSeconds) ??
    parseNum(jobData.nodeData?.delaySeconds) ??
    parseNum(jobData.nodeData?.duration);

  let effectiveDelayMs = 5000;
  if (rawDelayMs !== null) {
    effectiveDelayMs = Math.max(0, rawDelayMs);
  } else if (rawSeconds !== null) {
    effectiveDelayMs = Math.max(0, rawSeconds * 1000);
  }

  // 1. If this job is the resumed delayed execution, complete immediately
  if (jobData.isDelayCompleted) {
    return {
      delayed: false,
      completed: true,
      delayMs: effectiveDelayMs,
      resumesAt: new Date().toISOString(),
      nodeId,
      runId,
    };
  }

  // 2. If delay is 0 or negative, complete immediately
  if (effectiveDelayMs <= 0) {
    return {
      delayed: false,
      completed: true,
      delayMs: 0,
      nodeId,
      runId,
    };
  }

  // 3. Fallback synchronous wait (only used if explicitly requested in unit tests)
  if (options.fallbackWait) {
    await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
    return {
      delayed: false,
      completed: true,
      delayMs: effectiveDelayMs,
      resumesAt: new Date().toISOString(),
      nodeId,
      runId,
    };
  }

  // 4. Non-blocking BullMQ delayed transition via Redis ZSET
  const targetQueue = options.queue || (typeof getDagExecutionQueue === "function" ? getDagExecutionQueue() : null);

  if (targetQueue) {
    const nextJobId = `job_${runId}_${nodeId}_delayed_${Date.now()}`;
    const nextJobData: DAGJobData = {
      ...jobData,
      isDelayCompleted: true,
      delayedAt: new Date().toISOString(),
      resumesAt: new Date(Date.now() + effectiveDelayMs).toISOString(),
    };

    const delayedJob = await targetQueue.add(
      `exec:${nodeId}:delayed`,
      nextJobData,
      {
        delay: effectiveDelayMs,
        jobId: nextJobId,
        attempts: (job?.opts as any)?.attempts ?? 3,
        backoff: {
          type: "exponential-jitter",
        },
      }
    );

    return {
      delayed: true,
      completed: false,
      delayMs: effectiveDelayMs,
      resumesAt: nextJobData.resumesAt as string,
      delayedJobId: delayedJob.id,
      nodeId,
      runId,
    };
  }

  // If no queue available, return calculated delay metadata
  return {
    delayed: true,
    completed: false,
    delayMs: effectiveDelayMs,
    resumesAt: new Date(Date.now() + effectiveDelayMs).toISOString(),
    nodeId,
    runId,
  };
}
