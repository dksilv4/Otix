import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computePercentiles,
  getMemorySnapshot,
  generateMockGames,
  benchmarkRenderScroll,
  benchmarkScanThroughput,
  type LauncherBenchmarkReport,
} from '../scripts/benchmark-launcher-suite';

describe('Otix Desktop Launcher Benchmark Suite (F13)', () => {
  describe('Percentile and Statistics Helpers', () => {
    it('handles empty input arrays gracefully', () => {
      const stats = computePercentiles([]);
      expect(stats).toEqual({ p50: 0, p95: 0, p99: 0 });
    });

    it('accurately computes percentiles from sorted or unsorted distributions', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = computePercentiles(values);
      expect(stats.p50).toBe(60);
      expect(stats.p95).toBe(100);
      expect(stats.p99).toBe(100);
    });

    it('captures process memory snapshot with valid numeric bounds', () => {
      const mem = getMemorySnapshot();
      expect(typeof mem.rssMb).toBe('number');
      expect(mem.rssMb).toBeGreaterThan(0);
      expect(mem.heapUsedMb).toBeGreaterThan(0);
      expect(mem.heapTotalMb).toBeGreaterThan(0);
    });
  });

  describe('Mock Corpus Synthesis', () => {
    it('generates deterministic mock games with required Otix data contracts', () => {
      const games = generateMockGames(25);
      expect(games.length).toBe(25);

      const first = games[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('platform');
      expect(first).toHaveProperty('exePath');
      expect(first).toHaveProperty('installDir');
      expect(first).toHaveProperty('sizeBytes');
      expect(first).toHaveProperty('otixData');
      expect(first.sizeBytes).toBeGreaterThan(0);
      expect(typeof first.otixData).toBe('string');
    });
  });

  describe('Virtual Render & Scroll Frame Time Benchmark', () => {
    it('achieves 60+ FPS target SLA (< 16.6ms) across 120 scroll frames', () => {
      const mockGames = generateMockGames(500);
      const result = benchmarkRenderScroll(mockGames, 120, 16.6);

      expect(result.totalFrames).toBe(120);
      expect(result.totalMockItems).toBe(500);
      expect(result.meanFrameTimeMs).toBeLessThan(16.6);
      expect(result.effectiveFps).toBeGreaterThanOrEqual(60);
      expect(result.passed).toBe(true);
      expect(result.p95FrameTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.p99FrameTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Discovery & Scanner Throughput Benchmark', () => {
    it('sustains high-speed parsing throughput (> 5,000 items/sec)', () => {
      const result = benchmarkScanThroughput(300);

      expect(result.itemsScanned).toBe(300);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.itemsPerSecond).toBeGreaterThan(5000);
      expect(result.updateCount).toBeGreaterThan(0);
      expect(result.sceneCount).toBeGreaterThan(0);
    });
  });

  describe('Structured JSON Artifact Emission & SLA Compliance', () => {
    it('verifies generated desktop/benchmark-stats.json artifact contains valid SLA results', () => {
      const statsPath = path.resolve(__dirname, '../benchmark-stats.json');
      expect(fs.existsSync(statsPath)).toBe(true);

      const raw = fs.readFileSync(statsPath, 'utf-8');
      const data: LauncherBenchmarkReport = JSON.parse(raw);

      expect(data.suite).toBe('Otix Launcher Performance Benchmark Suite');
      expect(typeof data.timestamp).toBe('string');
      expect(data.slaPassed).toBe(true);

      // Hydration 500 SLA
      expect(data.hydration500.passed).toBe(true);
      expect(data.hydration500.meanLatencyMs).toBeLessThan(300);
      expect(data.hydration500.throughputItemsPerSec).toBeGreaterThan(1000);

      // Hydration 1500 SLA
      expect(data.hydration1500.passed).toBe(true);
      expect(data.hydration1500.meanLatencyMs).toBeLessThan(300);
      expect(data.hydration1500.throughputItemsPerSec).toBeGreaterThan(1000);

      // Render Scroll SLA
      expect(data.renderScroll.passed).toBe(true);
      expect(data.renderScroll.meanFrameTimeMs).toBeLessThan(16.6);
      expect(data.renderScroll.effectiveFps).toBeGreaterThanOrEqual(60);

      // Memory footprint
      expect(data.memory.baseline.rssMb).toBeGreaterThan(0);
      expect(data.memory.peak.rssMb).toBeGreaterThan(0);
      expect(data.memory.final.rssMb).toBeGreaterThan(0);
    });
  });
});
