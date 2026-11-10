/**
 * frontend/src/features/launcher/utils/diagnostics.ts
 *
 * Telemetry calculations, formatting helpers, and data contracts
 * for the In-App Performance Diagnostics Modal (F14).
 */

export interface LauncherMemoryMetrics {
  usedJsHeapMb: number;
  totalJsHeapMb: number;
  jsHeapLimitMb: number;
}

export interface LauncherDiagnosticsTelemetry {
  fps: number;
  frameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  minFps: number;
  maxFps: number;
  fpsHistory: number[];
  frameTimeHistory: number[];
  hydrationDurationMs: number | null;
  hydrationItemCount: number;
  ipcLatencyMs: number | null;
  ipcQueryCount: number;
  memory: LauncherMemoryMetrics | null;
  gameCount: number;
  activeTheme: string;
  isDesktop: boolean;
}

export type PerformanceTier = 'optimal' | 'warning' | 'critical';

/**
 * Computes the requested percentile (e.g. 50, 95, 99) from an array of numeric samples.
 */
export function calculateRollingPercentile(samples: number[], percentile: number): number {
  if (!samples || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const clampedPercentile = Math.max(0, Math.min(100, percentile));
  const index = Math.min(
    Math.floor((sorted.length * clampedPercentile) / 100),
    sorted.length - 1,
  );
  return Math.round(sorted[index] * 100) / 100;
}

/**
 * Classifies current frame rate into performance health tiers:
 * - Optimal: >= 58 FPS (smooth 60+ FPS experience)
 * - Warning: 35–57 FPS (minor hitching)
 * - Critical: < 35 FPS (severe frame drops)
 */
export function getFpsTier(fps: number): PerformanceTier {
  if (fps >= 58) return 'optimal';
  if (fps >= 35) return 'warning';
  return 'critical';
}

/**
 * Classifies frame time against 60 FPS target (16.67ms):
 * - Optimal: <= 16.67ms
 * - Warning: <= 28.5ms (35+ FPS)
 * - Critical: > 28.5ms
 */
export function getFrameTimeTier(ms: number): PerformanceTier {
  if (ms <= 16.67) return 'optimal';
  if (ms <= 28.5) return 'warning';
  return 'critical';
}

/**
 * Classifies library hydration duration against the <300ms SLA:
 * - Optimal: <= 150ms
 * - Warning: <= 300ms (within SLA boundary)
 * - Critical: > 300ms (exceeds SLA)
 */
export function getHydrationTier(ms: number | null): PerformanceTier {
  if (ms === null) return 'optimal';
  if (ms <= 150) return 'optimal';
  if (ms <= 300) return 'warning';
  return 'critical';
}

/**
 * Classifies IPC roundtrip latency:
 * - Optimal: <= 5ms
 * - Warning: <= 20ms
 * - Critical: > 20ms
 */
export function getIpcLatencyTier(ms: number | null): PerformanceTier {
  if (ms === null) return 'optimal';
  if (ms <= 5) return 'optimal';
  if (ms <= 20) return 'warning';
  return 'critical';
}

/**
 * Formats millisecond duration with 1 decimal place.
 */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '-- ms';
  return `${ms.toFixed(1)} ms`;
}

/**
 * Formats memory in MB with 1 decimal place.
 */
export function formatMemoryMb(mb: number | null | undefined): string {
  if (mb == null) return '-- MB';
  return `${mb.toFixed(1)} MB`;
}

/**
 * Formats FPS with integer precision.
 */
export function formatFps(fps: number | null | undefined): string {
  if (fps == null) return '-- FPS';
  return `${Math.round(fps)} FPS`;
}

/**
 * Formats ratio into percentage string.
 */
export function formatPercentage(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
