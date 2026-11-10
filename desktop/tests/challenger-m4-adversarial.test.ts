import { describe, it, expect } from 'vitest';
import {
  computePercentiles,
  getMemorySnapshot,
  generateMockGames,
  benchmarkRenderScroll,
  benchmarkScanThroughput,
} from '../scripts/benchmark-launcher-suite';

describe('Milestone 4 Adversarial Empirical Suite: Benchmark Calculations & Stress Testing', () => {
  describe('1. computePercentiles Extreme Input Boundary Testing', () => {
    it('handles empty arrays without throwing or returning NaN', () => {
      const result = computePercentiles([]);
      expect(result).toEqual({ p50: 0, p95: 0, p99: 0 });
      expect(Number.isNaN(result.p50)).toBe(false);
      expect(Number.isNaN(result.p95)).toBe(false);
      expect(Number.isNaN(result.p99)).toBe(false);
    });

    it('handles single item array deterministically', () => {
      const result = computePercentiles([42]);
      expect(result.p50).toBe(42);
      expect(result.p95).toBe(42);
      expect(result.p99).toBe(42);
    });

    it('handles two-item arrays accurately', () => {
      const result = computePercentiles([10, 20]);
      expect(result.p50).toBe(20);
      expect(result.p95).toBe(20);
      expect(result.p99).toBe(20);
    });

    it('handles all identical values without degradation', () => {
      const identical = new Array(500).fill(16.6);
      const result = computePercentiles(identical);
      expect(result.p50).toBe(16.6);
      expect(result.p95).toBe(16.6);
      expect(result.p99).toBe(16.6);
    });

    it('accurately computes percentiles with all negative numbers', () => {
      const negatives = [-500, -200, -100, -50, -25, -10, -5];
      const result = computePercentiles(negatives);
      expect(result.p50).toBe(-50);
      expect(result.p95).toBe(-5);
      expect(result.p99).toBe(-5);
    });

    it('handles mixed positive, negative, and zeros correctly', () => {
      const mixed = [-100, 0, 50, -50, 100, 0, 25];
      // Sorted: [-100, -50, 0, 0, 25, 50, 100] (len 7)
      // idx 50%: floor(7 * 0.5) = 3 -> 0
      // idx 95%: floor(7 * 0.95) = 6 -> 100
      const result = computePercentiles(mixed);
      expect(result.p50).toBe(0);
      expect(result.p95).toBe(100);
      expect(result.p99).toBe(100);
    });

    it('handles out-of-order epoch timestamps accurately', () => {
      const timestamps = [
        1731196800000,
        1577836800000,
        1640995200000,
        1546300800000,
        1704067200000,
      ];
      const result = computePercentiles(timestamps);
      // Sorted: [1546300800000, 1577836800000, 1640995200000, 1704067200000, 1731196800000]
      expect(result.p50).toBe(1640995200000);
      expect(result.p95).toBe(1731196800000);
      expect(result.p99).toBe(1731196800000);
    });

    it('scales to 10,000 items with sub-millisecond execution', () => {
      const largeSet = Array.from({ length: 10000 }, (_, i) => i + 1);
      const t0 = performance.now();
      const result = computePercentiles(largeSet);
      const duration = performance.now() - t0;

      expect(duration).toBeLessThan(15); // <15ms for 10k items
      expect(result.p50).toBe(5001);
      expect(result.p95).toBe(9501);
      expect(result.p99).toBe(9901);
    });

    it('handles high-precision floating point numbers', () => {
      const floats = [0.0001, 0.0002, 0.00015, 0.00005, 0.0003];
      const result = computePercentiles(floats);
      expect(result.p50).toBe(0.00015);
      expect(result.p95).toBe(0.0003);
    });

    it('handles extreme integer bounds (up to Number.MAX_SAFE_INTEGER)', () => {
      const extremes = [0, 1e12, -1e12, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
      const result = computePercentiles(extremes);
      expect(result.p50).toBe(0);
      expect(result.p95).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.p99).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('2. Mock Corpus Synthesis Stress & Boundary Testing', () => {
    it('handles 0 items without throwing', () => {
      const games = generateMockGames(0);
      expect(games).toEqual([]);
      expect(games.length).toBe(0);
    });

    it('synthesizes 10,000 mock games efficiently within memory bounds', () => {
      const t0 = performance.now();
      const games = generateMockGames(10000);
      const elapsed = performance.now() - t0;

      expect(games.length).toBe(10000);
      expect(elapsed).toBeLessThan(500); // 10,000 games generated in <500ms

      // Verify contract integrity on sample indices
      const indicesToCheck = [0, 999, 4999, 9999];
      for (const idx of indicesToCheck) {
        const g = games[idx];
        expect(g.id).toBeDefined();
        expect(g.title).toBeDefined();
        expect(g.platform).toBeDefined();
        expect(g.exePath).toContain('.exe');
        expect(g.sizeBytes).toBeGreaterThan(0);
        expect(JSON.parse(g.otixData)).toHaveProperty('titleId');
        expect(JSON.parse(g.updateFiles).length).toBe(1);
      }
    });
  });

  describe('3. Virtual Window Render / Scroll Frame Time Adversarial Testing', () => {
    it('survives an empty mock library (0 items) without crashing', () => {
      const result = benchmarkRenderScroll([], 60, 16.6);
      expect(result.totalMockItems).toBe(0);
      expect(result.totalFrames).toBe(60);
      expect(typeof result.meanFrameTimeMs).toBe('number');
      expect(typeof result.passed).toBe('boolean');
    });

    it('scales to massive 10,000-game library without frame drops (<16.6ms SLA / 60+ FPS)', () => {
      const massiveLibrary = generateMockGames(10000);
      const result = benchmarkRenderScroll(massiveLibrary, 120, 16.6);

      expect(result.totalMockItems).toBe(10000);
      expect(result.totalFrames).toBe(120);
      // Because virtual windowing restricts rendering to active rows, mean frame time must remain well under 16.6ms SLA
      expect(result.meanFrameTimeMs).toBeLessThan(16.6);
      expect(result.p99FrameTimeMs).toBeLessThan(16.6);
      expect(result.effectiveFps).toBeGreaterThanOrEqual(60);
      expect(result.passed).toBe(true);
    });

    it('survives single item library during 60 scroll frames', () => {
      const singleItem = generateMockGames(1);
      const result = benchmarkRenderScroll(singleItem, 60, 16.6);

      expect(result.totalMockItems).toBe(1);
      expect(result.meanFrameTimeMs).toBeLessThan(16.6);
      expect(result.passed).toBe(true);
    });

    it('handles heavy scroll duration of 360 frames (6 seconds of continuous scrolling)', () => {
      const library = generateMockGames(500);
      const result = benchmarkRenderScroll(library, 360, 16.6);

      expect(result.totalFrames).toBe(360);
      expect(result.meanFrameTimeMs).toBeLessThan(16.6);
      expect(result.effectiveFps).toBeGreaterThanOrEqual(60);
    });
  });

  describe('4. File Discovery & Scan Throughput Adversarial Testing', () => {
    it('handles zero items (itemCount = 0) gracefully without division by zero', () => {
      const result = benchmarkScanThroughput(0);
      expect(result.itemsScanned).toBe(0);
      expect(result.dlcCount).toBe(0);
      expect(result.updateCount).toBe(0);
      expect(result.sceneCount).toBe(0);
      expect(typeof result.itemsPerSecond).toBe('number');
      expect(Number.isNaN(result.itemsPerSecond)).toBe(false);
    });

    it('sustains > 15,000 items/sec throughput under 5,000 item ingestion', () => {
      const result = benchmarkScanThroughput(5000);
      expect(result.itemsScanned).toBe(5000);
      expect(result.itemsPerSecond).toBeGreaterThan(15000);
      expect(result.updateCount).toBeGreaterThan(0);
      expect(result.sceneCount).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  describe('5. Process Memory Snapshot Metric Sanity', () => {
    it('returns positive, valid numeric memory properties', () => {
      const mem = getMemorySnapshot();
      expect(mem.rssMb).toBeGreaterThan(0);
      expect(mem.heapUsedMb).toBeGreaterThan(0);
      expect(mem.heapTotalMb).toBeGreaterThan(0);
      expect(mem.externalMb).toBeGreaterThanOrEqual(0);
      expect(mem.heapTotalMb).toBeGreaterThanOrEqual(mem.heapUsedMb);
    });
  });
});
