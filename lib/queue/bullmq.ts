import { Queue, QueueOptions } from "bullmq";
import { createRedisConnection } from "../redis/client";

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
    skipVersionCheck: true,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential-jitter",
      },
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

function initQueue(name: string): Queue {
  const q = new Queue(name, getQueueOptions());
  q.on("error", (err) => {
    console.warn(`[BullMQ Queue ${name}] Connection warning: ${err.message}`);
  });
  return q;
}

/**
 * Returns the singleton BullMQ Queue dedicated to repeatable Cron workflow triggers.
 */
export function getCronQueue(): Queue {
  if (!globalForQueues.cronQueue) {
    globalForQueues.cronQueue = initQueue(QUEUE_NAMES.CRON_TRIGGERS);
  }
  return globalForQueues.cronQueue;
}

/**
 * Returns the BullMQ Queue dedicated to individual DAG node execution tasks.
 */
export function getDagExecutionQueue(): Queue {
  if (!globalForQueues.dagQueue) {
    globalForQueues.dagQueue = initQueue(QUEUE_NAMES.DAG_EXECUTION);
  }
  return globalForQueues.dagQueue;
}

/**
 * Returns the BullMQ Queue dedicated to permanently failed dead-letter jobs.
 */
export function getDeadLetterQueue(): Queue {
  if (!globalForQueues.dlqQueue) {
    globalForQueues.dlqQueue = initQueue(QUEUE_NAMES.DEAD_LETTER);
  }
  return globalForQueues.dlqQueue;
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
