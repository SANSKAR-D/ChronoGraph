import { Queue, QueueOptions } from "bullmq";
import { createRedisConnection } from "@/lib/redis/client";

// Core Queue Identifiers across ChronoGraph
export const QUEUE_NAMES = {
  CRON_TRIGGERS: "workflow-cron-triggers",
  DAG_EXECUTION: "dag-node-execution",
  DEAD_LETTER: "dag-dead-letter-jobs",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Default queue options using isolated Redis connection
function getQueueOptions(): QueueOptions {
  return {
    connection: createRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: {
        count: 500, // Retain last 500 successful jobs for telemetry
        age: 86400, // 24 hours
      },
      removeOnFail: {
        count: 1000, // Retain failures for DLQ inspection
      },
    },
  };
}

// Global cached queue instances to prevent connection proliferation during Next.js HMR
const globalForQueues = globalThis as unknown as {
  cronQueue?: Queue;
  dagQueue?: Queue;
  dlqQueue?: Queue;
};

/**
 * Returns the singleton BullMQ Queue dedicated to repeatable Cron workflow triggers.
 */
export function getCronQueue(): Queue {
  if (!globalForQueues.cronQueue) {
    globalForQueues.cronQueue = new Queue(QUEUE_NAMES.CRON_TRIGGERS, getQueueOptions());
  }
  return globalForQueues.cronQueue;
}

/**
 * Returns the BullMQ Queue dedicated to individual DAG node execution tasks.
 */
export function getDagExecutionQueue(): Queue {
  if (!globalForQueues.dagQueue) {
    globalForQueues.dagQueue = new Queue(QUEUE_NAMES.DAG_EXECUTION, getQueueOptions());
  }
  return globalForQueues.dagQueue;
}

/**
 * Gracefully closes all open queues (useful during tests and graceful shutdown).
 */
export async function closeAllQueues(): Promise<void> {
  const closures: Promise<void>[] = [];
  if (globalForQueues.cronQueue) {
    closures.push(globalForQueues.cronQueue.close());
    globalForQueues.cronQueue = undefined;
  }
  if (globalForQueues.dagQueue) {
    closures.push(globalForQueues.dagQueue.close());
    globalForQueues.dagQueue = undefined;
  }
  if (globalForQueues.dlqQueue) {
    closures.push(globalForQueues.dlqQueue.close());
    globalForQueues.dlqQueue = undefined;
  }
  await Promise.all(closures);
}
