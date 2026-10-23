import { MinimalJob } from "bullmq";

/**
 * Default base backoff interval in milliseconds (1 second).
 */
export const DEFAULT_BASE_BACKOFF_MS = 1000;

/**
 * Default maximum backoff cap in milliseconds (30 seconds).
 */
export const DEFAULT_MAX_BACKOFF_CAP_MS = 30000;

export interface BackoffOptions {
  baseMs?: number;
  maxCapMs?: number;
  /**
   * Optional custom random number generator returning [0, 1).
   * Useful for deterministic testing.
   */
  randomFn?: () => number;
}

/**
 * Computes the theoretical upper bound (ceiling) for an exponential retry attempt:
 * ceiling = Math.min(maxCap, base * Math.pow(2, attempt))
 *
 * @param attempt 1-indexed attempt number (1, 2, 3...)
 * @param base Base backoff in milliseconds (default: 1000ms)
 * @param maxCap Maximum cap in milliseconds (default: 30000ms)
 */
export function getBackoffCeiling(
  attempt: number,
  base: number = DEFAULT_BASE_BACKOFF_MS,
  maxCap: number = DEFAULT_MAX_BACKOFF_CAP_MS
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(maxCap, base * Math.pow(2, safeAttempt));
}

/**
 * Calculates exponential backoff with Full Jitter according to the formula:
 * T_delay = Math.floor(Math.random() * Math.min(maxCap, base * Math.pow(2, attempt)))
 *
 * Guarantees a non-negative integer delay in the range [0, min(maxCap, base * 2^attempt)].
 * Full jitter prevents thundering herd / DDoS spikes when downstream services recover.
 *
 * @param attempt 1-indexed retry attempt count
 * @param options Configurable baseMs and maxCapMs
 * @returns Delay in milliseconds (integer >= 0 and <= maxCap)
 */
export function calculateExponentialJitterBackoff(
  attempt: number,
  options?: BackoffOptions
): number {
  const base = options?.baseMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxCap = options?.maxCapMs ?? DEFAULT_MAX_BACKOFF_CAP_MS;
  const random = options?.randomFn ?? Math.random;

  const ceiling = getBackoffCeiling(attempt, base, maxCap);
  return Math.floor(random() * ceiling);
}

/**
 * Custom BullMQ BackoffStrategy function.
 * Matches BullMQ's expected signature:
 * `(attemptsMade: number, type?: string, err?: Error, job?: MinimalJob) => number | Promise<number>`
 *
 * Can be plugged directly into Worker options:
 * ```ts
 * const worker = new Worker(queueName, processor, {
 *   settings: {
 *     backoffStrategy: bullMQExponentialJitterBackoff,
 *   },
 * });
 * ```
 */
export function bullMQExponentialJitterBackoff(
  attemptsMade: number,
  _type?: string,
  _err?: Error,
  job?: MinimalJob
): number {
  // Extract node-specific backoff parameters if provided in job.data
  const jobData = job?.data as
    | {
        baseBackoffMs?: number;
        maxBackoffCapMs?: number;
        nodeData?: {
          baseBackoffMs?: number;
          maxBackoffCapMs?: number;
        };
      }
    | undefined;

  const baseMs =
    jobData?.nodeData?.baseBackoffMs ??
    jobData?.baseBackoffMs ??
    DEFAULT_BASE_BACKOFF_MS;

  const maxCapMs =
    jobData?.nodeData?.maxBackoffCapMs ??
    jobData?.maxBackoffCapMs ??
    DEFAULT_MAX_BACKOFF_CAP_MS;

  return calculateExponentialJitterBackoff(attemptsMade, {
    baseMs,
    maxCapMs,
  });
}
