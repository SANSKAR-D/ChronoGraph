import { describe, it, expect } from "vitest";
import {
  calculateExponentialJitterBackoff,
  getBackoffCeiling,
  bullMQExponentialJitterBackoff,
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_CAP_MS,
} from "./backoff";

describe("T3.3: Exponential Backoff + Full Jitter Strategy", () => {
  describe("getBackoffCeiling", () => {
    it("scales exponentially with attempt count", () => {
      // base * 2^attempt
      expect(getBackoffCeiling(1, 1000, 30000)).toBe(2000);
      expect(getBackoffCeiling(2, 1000, 30000)).toBe(4000);
      expect(getBackoffCeiling(3, 1000, 30000)).toBe(8000);
      expect(getBackoffCeiling(4, 1000, 30000)).toBe(16000);
    });

    it("respects maxCap constraint at higher attempts", () => {
      // 1000 * 2^5 = 32000 > 30000 => capped at 30000
      expect(getBackoffCeiling(5, 1000, 30000)).toBe(30000);
      expect(getBackoffCeiling(10, 1000, 30000)).toBe(30000);
    });

    it("handles zero or negative attempt counts safely by clamping to 1", () => {
      expect(getBackoffCeiling(0, 1000, 30000)).toBe(2000);
      expect(getBackoffCeiling(-1, 1000, 30000)).toBe(2000);
    });
  });

  describe("calculateExponentialJitterBackoff", () => {
    it("calculates exact deterministic values with custom random generator", () => {
      // random = 0.5, ceiling for attempt 1 (base 1000, cap 10000) = 2000 => floor(0.5 * 2000) = 1000
      const delay = calculateExponentialJitterBackoff(1, {
        baseMs: 1000,
        maxCapMs: 10000,
        randomFn: () => 0.5,
      });
      expect(delay).toBe(1000);

      // random = 0 => 0
      const minDelay = calculateExponentialJitterBackoff(2, {
        baseMs: 1000,
        maxCapMs: 10000,
        randomFn: () => 0,
      });
      expect(minDelay).toBe(0);

      // random = 0.9999, ceiling for attempt 2 = 4000 => floor(0.9999 * 4000) = 3999
      const maxDelay = calculateExponentialJitterBackoff(2, {
        baseMs: 1000,
        maxCapMs: 10000,
        randomFn: () => 0.9999,
      });
      expect(maxDelay).toBe(3999);
    });

    it("guarantees full jitter range [0, ceiling] across 200 stochastic trials", () => {
      const base = 500;
      const maxCap = 8000;
      const attempt = 3;
      const ceiling = getBackoffCeiling(attempt, base, maxCap); // 500 * 2^3 = 4000

      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const delay = calculateExponentialJitterBackoff(attempt, {
          baseMs: base,
          maxCapMs: maxCap,
        });

        expect(Number.isInteger(delay)).toBe(true);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(ceiling);
        samples.push(delay);
      }

      // Check dispersion: with 200 samples across [0, 4000], min should be small and max should be high
      const minSample = Math.min(...samples);
      const maxSample = Math.max(...samples);
      expect(minSample).toBeLessThan(1000);
      expect(maxSample).toBeGreaterThan(3000);
    });
  });

  describe("bullMQExponentialJitterBackoff", () => {
    it("uses default base and cap when job data is undefined", () => {
      const delay = bullMQExponentialJitterBackoff(1, undefined, undefined, undefined);
      const ceiling = getBackoffCeiling(1, DEFAULT_BASE_BACKOFF_MS, DEFAULT_MAX_BACKOFF_CAP_MS);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(ceiling);
    });

    it("extracts custom baseBackoffMs and maxBackoffCapMs from job nodeData", () => {
      const mockJob = {
        data: {
          nodeData: {
            baseBackoffMs: 200,
            maxBackoffCapMs: 1000,
          },
        },
      } as any;

      for (let i = 0; i < 50; i++) {
        const delay = bullMQExponentialJitterBackoff(4, undefined, undefined, mockJob);
        // 200 * 2^4 = 3200 capped at 1000
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(1000);
      }
    });

    it("extracts custom baseBackoffMs from top-level job data", () => {
      const mockJob = {
        data: {
          baseBackoffMs: 300,
          maxBackoffCapMs: 1200,
        },
      } as any;

      const delay = bullMQExponentialJitterBackoff(2, undefined, undefined, mockJob);
      // 300 * 2^2 = 1200
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(1200);
    });
  });
});
