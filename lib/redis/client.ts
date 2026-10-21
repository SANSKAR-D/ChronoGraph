import Redis, { RedisOptions } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Creates a fresh Redis client instance.
 * BullMQ requires `maxRetriesPerRequest: null` for blocking queue operations.
 */
export function createRedisConnection(overrides?: Partial<RedisOptions>): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      // Exponential backoff with a cap of 3 seconds
      return Math.min(times * 100, 3000);
    },
    ...overrides,
  });
}

// Global singleton for regular key-value, Pub/Sub, and Lua scripting operations
const globalForRedis = globalThis as unknown as {
  redisClient: Redis | undefined;
};

export const redis: Redis = globalForRedis.redisClient ?? createRedisConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redis;
}

export default redis;
