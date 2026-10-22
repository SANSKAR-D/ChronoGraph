import { describe, it, expect } from "vitest";
import {
  computeIdempotencyKey,
  ATOMIC_FAN_OUT_LUA,
  RELEASE_LOCK_LUA,
} from "./lua-scripts";

describe("Lua scripts & idempotency primitives", () => {
  it("computes deterministic 64-character SHA-256 idempotency key", () => {
    const runId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    const nodeId = "node_http_1";
    const attempt = 1;

    const key1 = computeIdempotencyKey(runId, nodeId, attempt);
    const key2 = computeIdempotencyKey(runId, nodeId, attempt);

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(key1)).toBe(true);
  });

  it("produces distinct keys for different attempts or nodes", () => {
    const runId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

    const attempt1 = computeIdempotencyKey(runId, "node_1", 1);
    const attempt2 = computeIdempotencyKey(runId, "node_1", 2);
    const node2 = computeIdempotencyKey(runId, "node_2", 1);

    expect(attempt1).not.toBe(attempt2);
    expect(attempt1).not.toBe(node2);
  });

  it("contains required atomic commands in Lua scripts", () => {
    expect(ATOMIC_FAN_OUT_LUA).toContain("SISMEMBER");
    expect(ATOMIC_FAN_OUT_LUA).toContain("SADD");
    expect(ATOMIC_FAN_OUT_LUA).toContain("HINCRBY");
    expect(ATOMIC_FAN_OUT_LUA).toContain("unlockedChildren");

    expect(RELEASE_LOCK_LUA).toContain("redis.call(\"GET\", KEYS[1])");
    expect(RELEASE_LOCK_LUA).toContain("redis.call(\"DEL\", KEYS[1])");
  });
});
