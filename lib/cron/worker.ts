import { Worker, Job } from "bullmq";
import { QUEUE_NAMES } from "@/lib/queue/bullmq";
import { createRedisConnection } from "@/lib/redis/client";
import { executeCronWorkflowTrigger } from "./trigger-executor";

export interface CronJobData {
  workflowId: string;
  cronExpression?: string;
  timezone?: string;
  scheduledBy?: string;
  triggeredAt?: string;
}

let cronWorkerInstance: Worker<CronJobData> | null = null;

/**
 * Creates and returns the BullMQ Worker that processes jobs emitted
 * by the repeatable Cron scheduler.
 */
export function createCronWorker(concurrency = 5): Worker<CronJobData> {
  const worker = new Worker<CronJobData>(
    QUEUE_NAMES.CRON_TRIGGERS,
    async (job: Job<CronJobData>) => {
      const { workflowId, cronExpression } = job.data;
      console.log(
        `[CronWorker] Processing scheduled trigger for workflow: ${workflowId} (cron: ${cronExpression || "N/A"})`
      );

      const result = await executeCronWorkflowTrigger(workflowId, {
        bullmqJobId: job.id,
        scheduledPattern: cronExpression,
        processedAt: new Date().toISOString(),
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to trigger workflow ${workflowId}`);
      }

      return {
        runId: result.runId,
        workflowId: result.workflowId,
        rootNodeCount: result.rootNodeIds?.length ?? 0,
      };
    },
    {
      connection: createRedisConnection(),
      concurrency,
      lockDuration: 15000,
      skipVersionCheck: true,
    }
  );

  worker.on("completed", (job) => {
    console.log(
      `[CronWorker] Successfully triggered workflow for job ${job.id} (RunId: ${job.returnvalue?.runId})`
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[CronWorker] Failed to trigger workflow for job ${job?.id}: ${err.message}`
    );
  });

  return worker;
}

/**
 * Starts the global cron worker instance if not already running.
 */
export function startCronWorker(concurrency = 5): Worker<CronJobData> {
  if (!cronWorkerInstance) {
    cronWorkerInstance = createCronWorker(concurrency);
  }
  return cronWorkerInstance;
}

/**
 * Gracefully shuts down the cron worker instance.
 */
export async function stopCronWorker(): Promise<void> {
  if (cronWorkerInstance) {
    await cronWorkerInstance.close();
    cronWorkerInstance = null;
  }
}
