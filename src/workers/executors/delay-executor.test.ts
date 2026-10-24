import { describe, it, expect, vi } from "vitest";
import { executeDelayNode } from "./delay-executor";

describe("T3.2: executeDelayNode Executor (Non-Blocking BullMQ Transition)", () => {
  it("schedules non-blocking delayed job in BullMQ queue when delay is pending", async () => {
    let enqueuedName = "";
    let enqueuedData: any = null;
    let enqueuedOpts: any = null;

    const mockQueue: any = {
      add: vi.fn().mockImplementation(async (name: string, data: any, opts: any) => {
        enqueuedName = name;
        enqueuedData = data;
        enqueuedOpts = opts;
        return { id: "delayed_job_123" };
      }),
    };

    const mockJob: any = {
      id: "job_init_001",
      data: {
        runId: "run_uuid_999",
        workflowId: "wf_uuid_111",
        nodeId: "delay_node_1",
        nodeType: "DELAY_TIMER",
        isDelayCompleted: false,
      },
      opts: {
        attempts: 3,
      },
    };

    const result = await executeDelayNode({
      delayMs: 3000,
      job: mockJob,
      queue: mockQueue,
    });

    expect(result.delayed).toBe(true);
    expect(result.completed).toBe(false);
    expect(result.delayMs).toBe(3000);
    expect(result.delayedJobId).toBe("delayed_job_123");
    expect(result.resumesAt).toBeDefined();

    expect(enqueuedName).toBe("exec:delay_node_1:delayed");
    expect(enqueuedData.isDelayCompleted).toBe(true);
    expect(enqueuedOpts.delay).toBe(3000);
    expect(enqueuedOpts.backoff).toEqual({ type: "exponential-jitter" });
  });

  it("completes immediately when resumed from BullMQ delayed ZSET (isDelayCompleted === true)", async () => {
    const mockJob: any = {
      id: "job_resumed_002",
      data: {
        runId: "run_uuid_999",
        nodeId: "delay_node_1",
        isDelayCompleted: true,
      },
    };

    const result = await executeDelayNode({
      delayMs: 5000,
      job: mockJob,
    });

    expect(result.delayed).toBe(false);
    expect(result.completed).toBe(true);
    expect(result.delayMs).toBe(5000);
  });

  it("completes immediately when delayMs is 0 or negative", async () => {
    const mockJob: any = {
      data: {
        runId: "run_uuid_999",
        nodeId: "delay_node_zero",
      },
    };

    const result = await executeDelayNode({
      delayMs: 0,
      job: mockJob,
    });

    expect(result.delayed).toBe(false);
    expect(result.completed).toBe(true);
    expect(result.delayMs).toBe(0);
  });

  it("safely parses string numbers and alternative property names (delay, duration)", async () => {
    const mockJob: any = {
      data: {
        runId: "run_uuid_999",
        nodeId: "delay_node_str",
        nodeData: {
          delay: "2500",
        },
      },
    };

    const result = await executeDelayNode({
      job: mockJob,
      queue: null as any,
    });

    expect(result.delayMs).toBe(2500);
    expect(result.delayed).toBe(true);
  });
});

