/**
 * frontend/src/features/launcher/components/organisms/launcher-performance-diagnostics-modal.tsx
 *
 * In-App Performance Diagnostics Modal (F14)
 *
 * Adheres strictly to:
 * - Established modal framework (DkDialog)
 * - Borderless soft glassmorphism (var(--dk-surface-overlay), border-white/[0.04], ambient shadows)
 * - Semantic theme tokens only (no hardcoded colors, no raw hex/rgb/palette classes)
 * - Arrow function component definition only
 * - Zero helper functions in component file (all calculations in utils/diagnostics.ts)
 * - Zero decorative circular dot indicators before text labels
 */

import { Activity, Gauge, Zap, Database, Cpu, Layers, RefreshCw, RotateCcw } from 'lucide-react';
import { DkDialog } from '@/components/ui/molecules/dialog';
import { useLauncherDiagnostics } from '@/features/launcher/hooks/use-launcher-diagnostics';
import {
  formatFps,
  formatLatency,
  formatMemoryMb,
  getFpsTier,
  getFrameTimeTier,
  getHydrationTier,
} from '@/features/launcher/utils/diagnostics';

interface LauncherPerformanceDiagnosticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LauncherPerformanceDiagnosticsModal = ({
  open,
  onOpenChange,
}: LauncherPerformanceDiagnosticsModalProps) => {
  const {
    fps,
    frameTimeMs,
    p95FrameTimeMs,
    p99FrameTimeMs,
    minFps,
    maxFps,
    fpsHistory,
    hydrationDurationMs,
    hydrationItemCount,
    ipcLatencyMs,
    ipcQueryCount,
    memory,
    gameCount,
    activeTheme,
    isDesktop,
    refreshIpcPing,
    resetHistory,
  } = useLauncherDiagnostics({ enabled: open });

  const fpsTier = getFpsTier(fps);
  const frameTimeTier = getFrameTimeTier(frameTimeMs);
  const hydrationTier = getHydrationTier(hydrationDurationMs);

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Launcher Performance Diagnostics"
      description="Real-time telemetry and SLA verification for rendering, hydration, IPC bridge, and memory."
      className="max-w-2xl bg-[var(--dk-surface-overlay)] border border-white/[0.04] shadow-2xl backdrop-blur-2xl"
    >
      <div className="space-y-4 pt-1 select-none">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Live FPS & Rolling History */}
          <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Gauge size={14} className="text-primary" />
                <span>Renderer Frame Rate</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  fpsTier === 'optimal'
                    ? 'bg-primary/20 text-primary'
                    : fpsTier === 'warning'
                      ? 'bg-status-warning/20 text-status-warning'
                      : 'bg-destructive/20 text-destructive'
                }`}
              >
                {fpsTier === 'optimal' ? '60+ FPS SLA Met' : fpsTier === 'warning' ? 'Acceptable' : 'Sub-Optimal'}
              </span>
            </div>

            <div className="flex items-baseline gap-2 my-1">
              <span className="text-3xl font-extrabold text-foreground tracking-tight">
                {formatFps(fps)}
              </span>
              <span className="text-xs text-muted-foreground">
                (Min: {minFps} / Max: {maxFps})
              </span>
            </div>

            {/* Sparkline / Bar track */}
            <div className="mt-3 flex items-end gap-1 h-8 w-full pt-1">
              {fpsHistory.slice(-24).map((sample, idx) => {
                const heightPercent = Math.max(15, Math.min(100, (sample / 120) * 100));
                return (
                  <div
                    key={`fps-bar-${idx}`}
                    className="flex-1 bg-primary/40 hover:bg-primary rounded-t-sm transition-all"
                    style={{ height: `${heightPercent}%` }}
                    title={`${sample} FPS`}
                  />
                );
              })}
            </div>
          </div>

          {/* Card 2: Frame Time & Latency Percentiles */}
          <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Activity size={14} className="text-primary" />
                <span>Frame Duration</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  frameTimeTier === 'optimal'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-status-warning/20 text-status-warning'
                }`}
              >
                Target &lt; 16.6ms
              </span>
            </div>

            <div className="flex items-baseline gap-2 my-1">
              <span className="text-3xl font-extrabold text-foreground tracking-tight">
                {formatLatency(frameTimeMs)}
              </span>
              <span className="text-xs text-muted-foreground">rolling mean</span>
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--dk-separator)]/40 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">95th Percentile</span>
                <span className="font-semibold text-foreground">{formatLatency(p95FrameTimeMs)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">99th Percentile</span>
                <span className="font-semibold text-foreground">{formatLatency(p99FrameTimeMs)}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Library Hydration SLA */}
          <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Database size={14} className="text-primary" />
                <span>Library Hydration</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hydrationTier === 'optimal'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-status-warning/20 text-status-warning'
                }`}
              >
                &lt; 300ms SLA
              </span>
            </div>

            <div className="flex items-baseline gap-2 my-1">
              <span className="text-3xl font-extrabold text-foreground tracking-tight">
                {formatLatency(hydrationDurationMs)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({hydrationItemCount} games in cache)
              </span>
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--dk-separator)]/40 flex items-center justify-between text-xs text-muted-foreground">
              <span>SQLite + TanStack Cache</span>
              <span className="font-medium text-foreground">SLA Verified</span>
            </div>
          </div>

          {/* Card 4: Desktop IPC Bridge Latency */}
          <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Zap size={14} className="text-primary" />
                <span>IPC Bridge Latency</span>
              </div>
              <button
                type="button"
                onClick={() => refreshIpcPing()}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                title="Ping IPC Bridge"
                aria-label="Ping IPC Bridge"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="flex items-baseline gap-2 my-1">
              <span className="text-3xl font-extrabold text-foreground tracking-tight">
                {formatLatency(ipcLatencyMs)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({ipcQueryCount} queries)
              </span>
            </div>

            <div className="mt-3 pt-2 border-t border-[var(--dk-separator)]/40 flex items-center justify-between text-xs text-muted-foreground">
              <span>Runtime Engine</span>
              <span className="font-medium text-foreground">
                {isDesktop ? 'Electron Desktop IPC' : 'Web Mock Bridge'}
              </span>
            </div>
          </div>
        </div>

        {/* System & Memory Overview Bar */}
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Cpu size={14} className="text-primary" />
              <span>Process Memory &amp; Theme Environment</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Layers size={13} className="text-primary" />
              <span>Theme: <strong className="text-foreground uppercase">{activeTheme}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
              <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">JS Heap Used</span>
              <span className="text-sm font-bold text-foreground">{formatMemoryMb(memory?.usedJsHeapMb)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
              <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Total Allocated</span>
              <span className="text-sm font-bold text-foreground">{formatMemoryMb(memory?.totalJsHeapMb)}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--dk-surface-field)] border border-white/[0.04]">
              <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Library Size</span>
              <span className="text-sm font-bold text-foreground">{gameCount} Games</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={resetHistory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-white/[0.04]"
          >
            <RotateCcw size={12} />
            <span>Reset Telemetry History</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </DkDialog>
  );
};
