import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateDesiredWorkers,
  WorkerAutoscaler,
  AutoscalerTelemetryState,
} from "./autoscaler";
import EventEmitter from "events";

describe("Worker Autoscaler: Calculation & Scaling Logic", () => {
  const baseConfig = {
    minWorkers: 1,
    maxWorkers: 6,
    targetBacklogPerWorker: 5,
  };

  it("returns minWorkers when queue is completely empty and idle", () => {
    const desired = calculateDesiredWorkers(0, 0, 1, baseConfig);
    expect(desired).toBe(1);
  });

  it("scales up proportionally according to waiting backlog", () => {
    // 12 waiting jobs / 5 per worker = ceil(2.4) = 3 workers
    const desired = calculateDesiredWorkers(12, 0, 1, baseConfig);
    expect(desired).toBe(3);
  });

  it("scales up further under heavier load", () => {
    // 25 waiting jobs / 5 per worker = 5 workers
    const desired = calculateDesiredWorkers(25, 2, 2, baseConfig);
    expect(desired).toBe(5);
  });

  it("strictly caps desired workers at maxWorkers", () => {
    // 100 waiting jobs would demand 20 workers, but max is 6
    const desired = calculateDesiredWorkers(100, 5, 2, baseConfig);
    expect(desired).toBe(6);
  });

  it("handles edge cases and zero/negative numbers cleanly", () => {
    const desired = calculateDesiredWorkers(-5, -2, 1, {
      minWorkers: 2,
      maxWorkers: 4,
      targetBacklogPerWorker: 0,
    });
    expect(desired).toBe(2);
  });
});

describe("WorkerAutoscaler Class Lifecycle & Process Supervision", () => {
  let mockQueue: any;
  let mockRedis: any;

  beforeEach(() => {
    mockQueue = {
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    };

    mockRedis = {
      set: vi.fn().mockResolvedValue("OK"),
      publish: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("initializes with configured limits and evaluates queue metrics", async () => {
    const autoscaler = new WorkerAutoscaler({
      minWorkers: 2,
      maxWorkers: 5,
      targetBacklogPerWorker: 4,
      dagQueueClient: mockQueue,
      redisClient: mockRedis,
    });

    expect(autoscaler.minWorkers).toBe(2);
    expect(autoscaler.maxWorkers).toBe(5);
    expect(autoscaler.targetBacklogPerWorker).toBe(4);
  });

  it("evaluates load and emits telemetry update to Redis", async () => {
    mockQueue.getJobCounts.mockResolvedValueOnce({ waiting: 8, active: 1 });

    const autoscaler = new WorkerAutoscaler({
      minWorkers: 1,
      maxWorkers: 4,
      targetBacklogPerWorker: 4,
      dagQueueClient: mockQueue,
      redisClient: mockRedis,
    });

    // Mock spawnWorker so it doesn't spin actual real OS processes in this unit test
    const spawnSpy = vi.spyOn(autoscaler, "spawnWorker").mockImplementation(() => null);

    const telemetry = await autoscaler.evaluateAndScale();

    expect(telemetry.enabled).toBe(true);
    expect(telemetry.desiredWorkers).toBe(2); // 8 / 4 = 2 workers
    expect(telemetry.queue.waiting).toBe(8);
    expect(telemetry.status).toBe("scaling_up");

    // Verify Redis telemetry key was updated
    expect(mockRedis.set).toHaveBeenCalledWith(
      "cluster:autoscaler:state",
      expect.stringContaining('"desiredWorkers":2'),
      "EX",
      30
    );
    expect(mockRedis.publish).toHaveBeenCalledWith(
      "channel:cluster:events",
      expect.stringContaining('"event":"AUTOSCALER_UPDATE"')
    );
  });

  it("auto-heals and replaces crashed workers if below minWorkers", () => {
    const autoscaler = new WorkerAutoscaler({
      minWorkers: 1,
      maxWorkers: 3,
      dagQueueClient: mockQueue,
      redisClient: mockRedis,
    });

    // Simulate running state
    (autoscaler as any).isRunning = true;

    const spawnSpy = vi.spyOn(autoscaler, "spawnWorker").mockImplementation(() => null);

    // Call private handleWorkerExit directly
    (autoscaler as any).handleWorkerExit("autoscale-worker-crash-test", 1, null);

    // Because active workers is 0 (< minWorkers 1), it must invoke spawnWorker to heal
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it("respects cooldown timer during scale down to prevent flapping", async () => {
    // Zero waiting jobs -> desires 1 worker
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 0, active: 0 });

    const autoscaler = new WorkerAutoscaler({
      minWorkers: 1,
      maxWorkers: 4,
      scaleDownCooldownMs: 15000,
      dagQueueClient: mockQueue,
      redisClient: mockRedis,
    });

    // Fake 3 active workers
    const fakeChild = Object.assign(new EventEmitter(), {
      pid: 1234,
      kill: vi.fn(),
    });

    (autoscaler as any).managedWorkers.set("w1", {
      id: "w1",
      pid: 101,
      process: fakeChild,
      isShuttingDown: false,
    });
    (autoscaler as any).managedWorkers.set("w2", {
      id: "w2",
      pid: 102,
      process: fakeChild,
      isShuttingDown: false,
    });
    (autoscaler as any).managedWorkers.set("w3", {
      id: "w3",
      pid: 103,
      process: fakeChild,
      isShuttingDown: false,
    });

    // Recently scaled down: set lastScaleDownTime to right now
    (autoscaler as any).lastScaleDownTime = Date.now();

    const terminateSpy = vi.spyOn(autoscaler, "terminateOneWorker");

    // First evaluation: cooldown is still active, so no termination happens
    const state1 = await autoscaler.evaluateAndScale();
    expect(terminateSpy).not.toHaveBeenCalled();
    expect(state1.lastAction).toContain("Cooldown active");

    // Advance time past cooldown
    (autoscaler as any).lastScaleDownTime = Date.now() - 20000;

    // Second evaluation: cooldown satisfied, terminates 1 worker
    const state2 = await autoscaler.evaluateAndScale();
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    expect(state2.status).toBe("scaling_down");
  });
});
