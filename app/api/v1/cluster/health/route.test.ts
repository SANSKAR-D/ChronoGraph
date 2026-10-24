import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRedis, mockDb, mockDagQueue, mockCronQueue, mockDlqQueue } = vi.hoisted(() => ({
  mockRedis: {
    ping: vi.fn(),
    keys: vi.fn(),
    mget: vi.fn(),
  },
  mockDb: {
    deadLetterJob: {
      count: vi.fn(),
    },
    workflowRun: {
      count: vi.fn(),
    },
  },
  mockDagQueue: {
    getJobCounts: vi.fn(),
  },
  mockCronQueue: {
    getJobCounts: vi.fn(),
  },
  mockDlqQueue: {
    getJobCounts: vi.fn(),
  },
}));

vi.mock("@/lib/redis/client", () => ({
  redis: mockRedis,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/queue/bullmq", () => ({
  getDagExecutionQueue: () => mockDagQueue,
  getCronQueue: () => mockCronQueue,
  getDeadLetterQueue: () => mockDlqQueue,
  QUEUE_NAMES: {
    CRON_TRIGGERS: "workflow-cron-triggers",
    DAG_EXECUTION: "dag-node-execution",
    DEAD_LETTER: "dag-dead-letter-jobs",
  },
}));

import { GET } from "./route";

describe("GET /api/v1/cluster/health (Task T4.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.mget.mockResolvedValue([]);
    mockDb.deadLetterJob.count.mockResolvedValue(0);
    mockDb.workflowRun.count.mockResolvedValue(0);
    mockDagQueue.getJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    });
    mockCronQueue.getJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    });
    mockDlqQueue.getJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      failed: 0,
    });
  });

  it("returns 200 with healthy status and zero metrics when cluster is empty", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("healthy");
    expect(json.activeWorkerCount).toBe(0);
    expect(json.activeWorkers).toBe(0);
    expect(json.workers).toEqual([]);
    expect(json.heartbeatTimestamps).toEqual({});

    expect(json.queueMetrics).toMatchObject({
      waiting: 0,
      active: 0,
      delayed: 0,
      dlq: 0,
      Waiting: 0,
      Active: 0,
      Delayed: 0,
      DLQ: 0,
    });
    expect(json.redis.status).toBe("connected");
    expect(json.database.status).toBe("connected");
  });

  it("returns active worker count and heartbeat timestamps from Redis keys", async () => {
    const now = "2026-10-24T16:15:00.000Z";
    const worker1 = {
      workerId: "worker-node-1",
      name: "dag-worker-de-1",
      status: "healthy",
      concurrency: 20,
      cpu: 18,
      memory: "160 MB",
      activeJobs: 2,
      lastHeartbeat: now,
      timestamp: now,
    };
    const worker2 = {
      workerId: "worker-node-2",
      name: "dag-worker-de-2",
      status: "busy",
      concurrency: 20,
      cpu: 85,
      memory: "210 MB",
      activeJobs: 20,
      lastHeartbeat: now,
      timestamp: now,
    };

    mockRedis.keys.mockResolvedValue([
      "worker:heartbeat:worker-node-1",
      "worker:heartbeat:worker-node-2",
    ]);
    mockRedis.mget.mockResolvedValue([
      JSON.stringify(worker1),
      JSON.stringify(worker2),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.activeWorkerCount).toBe(2);
    expect(json.activeWorkers).toBe(2);
    expect(json.workers).toHaveLength(2);
    expect(json.heartbeatTimestamps["worker-node-1"]).toBe(now);
    expect(json.heartbeatTimestamps["worker-node-2"]).toBe(now);
  });

  it("correctly aggregates queue metrics for Waiting, Active, Delayed, and DLQ", async () => {
    // DAG Queue: 8 waiting, 3 active, 2 delayed, 1 failed, 15 completed
    mockDagQueue.getJobCounts.mockResolvedValue({
      waiting: 8,
      active: 3,
      delayed: 2,
      failed: 1,
      completed: 15,
    });

    // Cron Queue: 2 waiting, 1 active, 0 delayed, 0 failed
    mockCronQueue.getJobCounts.mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 0,
    });

    // DLQ Queue: 1 waiting, 0 active, 0 failed
    mockDlqQueue.getJobCounts.mockResolvedValue({
      waiting: 1,
      active: 0,
      failed: 0,
    });

    // Database DLQ records: 4 total, 3 unresolved (replayed == false)
    mockDb.deadLetterJob.count
      .mockResolvedValueOnce(4) // total
      .mockResolvedValueOnce(3); // unresolved

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    // Waiting: 8 (dag) + 2 (cron) = 10
    expect(json.queueMetrics.waiting).toBe(10);
    expect(json.queueMetrics.Waiting).toBe(10);

    // Active: 3 (dag) + 1 (cron) = 4
    expect(json.queueMetrics.active).toBe(4);
    expect(json.queueMetrics.Active).toBe(4);

    // Delayed: 2 (dag) + 0 (cron) = 2
    expect(json.queueMetrics.delayed).toBe(2);
    expect(json.queueMetrics.Delayed).toBe(2);

    // DLQ: 1 (dlq queue) + 3 (unresolved db records) = 4
    expect(json.queueMetrics.dlq).toBe(4);
    expect(json.queueMetrics.DLQ).toBe(4);

    // Overall status is degraded because DLQ has unresolved jobs
    expect(json.status).toBe("degraded");
  });

  it("reports degraded status if jobs are waiting but zero workers are active", async () => {
    mockDagQueue.getJobCounts.mockResolvedValue({
      waiting: 5,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    });
    mockRedis.keys.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.activeWorkerCount).toBe(0);
    expect(json.queueMetrics.waiting).toBe(5);
    expect(json.status).toBe("degraded");
  });

  it("returns 503 with down status if Redis connection fails", async () => {
    mockRedis.ping.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:6379"));

    const res = await GET();
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.status).toBe("down");
    expect(json.redis.status).toBe("error");
    expect(json.redis.error).toContain("ECONNREFUSED");
  });

  it("includes Cache-Control headers to prevent caching", async () => {
    const res = await GET();
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("no-store");
  });
});
