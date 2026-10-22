import Redis from "ioredis";
import crypto from "crypto";

/**
 * Single-threaded, atomic Redis Lua script for Diamond-Dependency Resolution.
 * Eliminates Read-Modify-Write race conditions when parallel parent nodes finish simultaneously.
 *
 * KEYS[1]: run:{runId}:indegree (Redis Hash storing remaining in-degree parent counts)
 * KEYS[2]: run:{runId}:completed_nodes (Redis Set of finished node IDs)
 * ARGV[1]: completedParentNodeId
 * ARGV[2..N]: downstreamChildNodeIds
 */
export const ATOMIC_FAN_OUT_LUA = `
-- Guard against duplicate parent completion
if redis.call("SISMEMBER", KEYS[2], ARGV[1]) == 1 then
    return {}
end
redis.call("SADD", KEYS[2], ARGV[1])
redis.call("EXPIRE", KEYS[2], 86400)

local unlockedChildren = {}
for i = 2, #ARGV do
    local childId = ARGV[i]
    local remaining = redis.call("HINCRBY", KEYS[1], childId, -1)
    if remaining == 0 then
        table.insert(unlockedChildren, childId)
    end
end

return unlockedChildren
`;

/**
 * Lua script for releasing an idempotency lock only if the current value matches the lock token.
 * KEYS[1]: lock:idem:{key}
 * ARGV[1]: lockValue
 */
export const RELEASE_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`;

/**
 * Computes deterministic idempotency key for DAG node execution attempts:
 * K_idempotent = SHA-256(run_id || node_id || attempt)
 */
export function computeIdempotencyKey(
  runId: string,
  nodeId: string,
  attempt: number = 1
): string {
  return crypto
    .createHash("sha256")
    .update(`${runId}:${nodeId}:${attempt}`)
    .digest("hex");
}

/**
 * Executes atomic in-degree decrement for all downstream children upon parent node completion.
 * Only the single worker thread that decrements a child node's remaining in-degree to 0
 * receives childId in the returned array to enqueue into BullMQ.
 *
 * @param redisClient ioredis client instance
 * @param runId Active workflow run UUID
 * @param completedParentNodeId Node ID that just completed successfully
 * @param downstreamChildNodeIds Array of child node IDs dependent on this parent
 * @returns Array of child node IDs that reached in-degree 0 and are unlocked for execution
 */
export async function atomicFanOutDecrement(
  redisClient: Redis,
  runId: string,
  completedParentNodeId: string,
  downstreamChildNodeIds: string[]
): Promise<string[]> {
  const indegreeKey = `run:${runId}:indegree`;
  const completedKey = `run:${runId}:completed_nodes`;

  const uniqueChildNodeIds = Array.from(new Set(downstreamChildNodeIds));
  const args: (string | number)[] = [completedParentNodeId, ...uniqueChildNodeIds];

  const result = await redisClient.eval(
    ATOMIC_FAN_OUT_LUA,
    2,
    indegreeKey,
    completedKey,
    ...args
  );

  return (result as string[]) || [];
}

/**
 * Atomically acquires an idempotency lock using Redis `SET lock:idem:{K} "LOCKED" NX EX ttl`.
 *
 * @param redisClient ioredis client instance
 * @param idempotencyKey Deterministic SHA-256 idempotency key
 * @param ttlSeconds Lock TTL in seconds (default 3600 = 1 hour)
 * @param lockValue Value stored in lock (default "LOCKED")
 * @returns true if lock was successfully acquired, false if already held
 */
export async function acquireIdempotencyLock(
  redisClient: Redis,
  idempotencyKey: string,
  ttlSeconds: number = 3600,
  lockValue: string = "LOCKED"
): Promise<boolean> {
  const lockKey = `lock:idem:${idempotencyKey}`;
  const result = await redisClient.set(lockKey, lockValue, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/**
 * Atomically releases an idempotency lock if the stored token matches.
 */
export async function releaseIdempotencyLock(
  redisClient: Redis,
  idempotencyKey: string,
  lockValue: string = "LOCKED"
): Promise<boolean> {
  const lockKey = `lock:idem:${idempotencyKey}`;
  const result = await redisClient.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
  return result === 1;
}

/**
 * Seeds topological in-degree counts and runtime structures into Redis for a fresh workflow run.
 */
export async function seedRunIndegrees(
  redisClient: Redis,
  runId: string,
  baseIndegrees: Record<string, number>,
  initialPayload: Record<string, unknown> = {},
  ttlSeconds: number = 86400
): Promise<void> {
  const pipeline = redisClient.pipeline();
  const indegreeKey = `run:${runId}:indegree`;
  const outputsKey = `run:${runId}:outputs`;
  const completedKey = `run:${runId}:completed_nodes`;

  const entries = Object.entries(baseIndegrees);
  if (entries.length > 0) {
    const hashData: Record<string, number> = {};
    for (const [nodeId, degree] of entries) {
      hashData[nodeId] = degree;
    }
    pipeline.hset(indegreeKey, hashData);
  }

  pipeline.hset(
    outputsKey,
    "TRIGGER",
    JSON.stringify({
      payload: initialPayload,
      timestamp: new Date().toISOString(),
    })
  );

  pipeline.expire(indegreeKey, ttlSeconds);
  pipeline.expire(outputsKey, ttlSeconds);
  pipeline.expire(completedKey, ttlSeconds);

  await pipeline.exec();
}

/**
 * High-performance sliding-window rate limiter utilizing Redis sorted sets (ZSET).
 * Allows <= limit requests per windowSeconds per identifier.
 */
export async function checkRateLimit(
  redisClient: Redis,
  identifier: string,
  limit: number = 120,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rateLimitKey = `ratelimit:hook:${identifier}`;

  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(rateLimitKey, 0, windowStart);
  pipeline.zcard(rateLimitKey);
  pipeline.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
  pipeline.expire(rateLimitKey, windowSeconds);

  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) || 0;

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetSeconds: windowSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count - 1),
    resetSeconds: windowSeconds,
  };
}
