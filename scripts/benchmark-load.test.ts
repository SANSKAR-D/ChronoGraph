import { describe, it, expect } from "vitest";
import {
  calculatePercentile,
  calculateLatencyStats,
  verifyZeroDoubleExecution,
  generateSyntheticBenchmark,
  runLoadBenchmark,
} from "./benchmark-load";

describe("T6.2: Load Test Benchmark & Ingestion Latency Stats", () => {
  it("calculates accurate percentiles from sorted latencies", () => {
    // 100 values from 1ms to 100ms
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(calculatePercentile(samples, 50)).toBe(50);
    expect(calculatePercentile(samples, 90)).toBe(90);
    expect(calculatePercentile(samples, 95)).toBe(95);
    expect(calculatePercentile(samples, 99)).toBe(99);
  });

  it("handles edge cases in percentile calculations", () => {
    expect(calculatePercentile([], 50)).toBe(0);
    expect(calculatePercentile([12.5], 99)).toBe(12.5);
  });

  it("computes comprehensive statistical summary adhering to < 25ms SLA", () => {
    // 200 synthetic latencies all between 5ms and 20ms
    const latencies = Array.from({ length: 200 }, () => 5 + Math.random() * 15);
    const totalDurationMs = 250;

    const stats = calculateLatencyStats(latencies, totalDurationMs);

    expect(stats.min).toBeGreaterThan(0);
    expect(stats.p50).toBeGreaterThanOrEqual(stats.min);
    expect(stats.p95).toBeGreaterThanOrEqual(stats.p50);
    expect(stats.p99).toBeGreaterThanOrEqual(stats.p95);
    expect(stats.max).toBeGreaterThanOrEqual(stats.p99);
    expect(stats.throughputRps).toBeGreaterThan(0);
    expect(stats.slaPassP99).toBe(true);
  });

  it("flags SLA failure when p99 exceeds 25ms", () => {
    const highLatencies = Array.from({ length: 100 }, () => 30);
    const stats = calculateLatencyStats(highLatencies, 3000);

    expect(stats.p99).toBe(30);
    expect(stats.slaPassP99).toBe(false);
  });

  it("proves zero double-execution when all returned run IDs are distinct", () => {
    const runIds = Array.from({ length: 200 }, (_, i) => `run-uuid-${i + 1}`);
    const result = verifyZeroDoubleExecution(runIds);

    expect(result.totalRuns).toBe(200);
    expect(result.uniqueRuns).toBe(200);
    expect(result.duplicateRuns).toBe(0);
    expect(result.isZeroDoubleExecution).toBe(true);
  });

  it("detects duplicate executions if duplicated run IDs occur", () => {
    const runIds = ["run-1", "run-2", "run-1", "run-3"];
    const result = verifyZeroDoubleExecution(runIds);

    expect(result.totalRuns).toBe(4);
    expect(result.uniqueRuns).toBe(3);
    expect(result.duplicateRuns).toBe(1);
    expect(result.isZeroDoubleExecution).toBe(false);
  });

  it("executes 200 concurrent simulated benchmark requests and produces complete report", async () => {
    const report = await runLoadBenchmark({
      totalRequests: 200,
      mockIfOffline: true,
    });

    expect(report.success).toBe(true);
    expect(report.totalRequested).toBe(200);
    expect(report.successfulRequests).toBe(200);
    expect(report.failedRequests).toBe(0);
    expect(report.stats.p50).toBeGreaterThan(0);
    expect(report.stats.p95).toBeGreaterThan(0);
    expect(report.stats.p99).toBeGreaterThan(0);
    expect(report.stats.slaPassP99).toBe(true);
    expect(report.doubleExecution.isZeroDoubleExecution).toBe(true);
  });
});
