import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDagWorker,
  startDagWorker,
  stopDagWorker,
  loadRunExecutionContext,
} from "./dag-worker";

// Mock BullMQ Worker
vi.mock("bullmq", async () => {
  const actual = await vi.importActual<any>("bullmq");
  class MockWorker {
    name: string;
    processor: (job: any) => Promise<any>;
    opts: any;
    isClosed = false;
    events: Record<string, ((...args: any[]) => void)[]> = {};

    constructor(name: string, processor: (job: any) => Promise<any>, opts: any) {
      this.name = name;
      this.processor = processor;
      this.opts = opts;
    }

    on(event: string, handler: (...args: any[]) => void) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(handler);
      return this;
    }

    async close() {
      this.isClosed = true;
    }
  }

  return {
    ...actual,
    Worker: MockWorker,
  };
});

describe("T3.1: DAG BullMQ Worker & Heartbeat Runner", () => {
  let mockRedis: any;
  let mockDb: any;
  let mockQueue: any;

  beforeEach(() => {
    mockRedis = {
      set: vi.fn().mockResolvedValue("OK"),
      publish: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({}),
      hset: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue([]),
      scard: vi.fn().mockResolvedValue(0),
    };

    mockDb = {
      nodeExecutionLog: {
        upsert: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
      workflowBlueprint: {
        findUnique: vi.fn().mockResolvedValue({
          id: "wf_1",
          nodesJson: [{ id: "node_1", type: "HTTP_REQUEST", data: {} }],
          adjacencyMap: { node_1: [] },
        }),
      },
      workflowRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: "job_child_1" }),
    };
  });

  afterEach(async () => {
    await stopDagWorker();
    vi.clearAllMocks();
  });

  it("creates worker with configurable concurrency and emits heartbeat to worker:heartbeat:{workerId}", async () => {
    const customWorkerId = "worker-test-alpha-99";
    const worker = createDagWorker({
      workerId: customWorkerId,
      concurrency: 25,
      heartbeatIntervalMs: 50,
      redisClient: mockRedis,
      dbClient: mockDb,
      dagQueueClient: mockQueue,
    });

    expect(worker).toBeDefined();
    expect((worker as any).opts.concurrency).toBe(25);

    // Allow async heartbeat execution tick
    await new Promise((r) => setTimeout(r, 10));

    // Verify initial heartbeat was emitted to Redis
    expect(mockRedis.set).toHaveBeenCalled();
    const setCalls = mockRedis.set.mock.calls;
    const heartbeatCall = setCalls.find((call: any[]) =>
      call[0] === `worker:heartbeat:${customWorkerId}`
    );
    expect(heartbeatCall).toBeDefined();

    const payload = JSON.parse(heartbeatCall[1]);
    expect(payload.workerId).toBe(customWorkerId);
    expect(payload.concurrency).toBe(25);
    expect(payload.status).toBe("healthy");
    expect(heartbeatCall[2]).toBe("EX");
    expect(heartbeatCall[3]).toBe(15);

    // Verify heartbeat was published to channel:cluster:heartbeats
    expect(mockRedis.publish).toHaveBeenCalledWith(
      "channel:cluster:heartbeats",
      expect.stringContaining(customWorkerId)
    );

    await worker.close();
  });

  it("loads run execution context safely from Redis", async () => {
    mockRedis.hgetall.mockResolvedValueOnce({
      node_prev: JSON.stringify({ data: { userId: 12345 } }),
    });

    const ctx = await loadRunExecutionContext(mockRedis, "run_001", { orderId: "ord_55" });
    expect((ctx.trigger as any).orderId).toBe("ord_55");
    expect((ctx.node_prev as any).data.userId).toBe(12345);
  });

  it("starts and stops global worker runner gracefully", async () => {
    const worker1 = startDagWorker({
      workerId: "global-worker-1",
      concurrency: 10,
      redisClient: mockRedis,
      dbClient: mockDb,
    });
    const worker2 = startDagWorker();
    expect(worker1).toBe(worker2);

    await stopDagWorker();
  });

  it("processes a transform job, stores output in Redis, and unlocks child nodes via fan-out", async () => {
    // Unlocked children returned by Lua fan-out
    mockRedis.eval.mockResolvedValueOnce(["child_node_2"]);

    const worker = createDagWorker({
      workerId: "worker-job-runner",
      concurrency: 5,
      redisClient: mockRedis,
      dbClient: mockDb,
      dagQueueClient: mockQueue,
    });

    const mockJob: any = {
      id: "job_001",
      attemptsMade: 0,
      opts: { attempts: 3 },
      data: {
        runId: "run_uuid_100",
        workflowId: "wf_1",
        nodeId: "node_1",
        nodeType: "JSON_TRANSFORM",
        nodeData: {
          script: "payload.val * 2",
          payload: { val: 21 },
        },
        downstreamNodeIds: ["child_node_2"],
      },
    };

    // Invoke the processor
    const processor = (worker as any).processor;
    const result = await processor(mockJob);

    expect(result.success).toBe(true);

    // Verify output stored in Redis
    expect(mockRedis.hset).toHaveBeenCalledWith(
      "run:run_uuid_100:outputs",
      "node_1",
      expect.stringContaining('"data":42')
    );

    // Verify DB log updated to SUCCESS
    expect(mockDb.nodeExecutionLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "SUCCESS",
          nodeId: "node_1",
        }),
      })
    );

    // Verify child node enqueued into queue
    expect(mockQueue.add).toHaveBeenCalledWith(
      "exec:child_node_2",
      expect.objectContaining({
        nodeId: "child_node_2",
        runId: "run_uuid_100",
      }),
      expect.any(Object)
    );

    await worker.close();
  });
});

