import Redis, { RedisOptions } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Creates a fresh Redis client instance.
 * BullMQ requires `maxRetriesPerRequest: null` for blocking queue operations.
 */
export function createRedisConnection(overrides?: Partial<RedisOptions>): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    keepAlive: 10000,
    connectTimeout: 15000,
    family: 4, // Prefer IPv4 for cloud network stability
    retryStrategy(times) {
      // Exponential backoff with a cap of 3 seconds
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "EPIPE", "ECONNRESET", "ETIMEDOUT"];
      if (targetErrors.some((e) => err.message.includes(e))) {
        return true; // Reconnect automatically on socket reset or broken pipe
      }
      return false;
    },
    ...overrides,
  });

  // Attach error handler to prevent Node.js unhandled error crashes on network disconnects
  client.on("error", (err: any) => {
    console.warn(`[Redis Connection] ${err?.code || err?.message || err}`);
  });

  return client;
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
