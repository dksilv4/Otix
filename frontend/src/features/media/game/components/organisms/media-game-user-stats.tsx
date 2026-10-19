import { useState, useMemo } from 'react'
import {
  Gamepad2,
  Clock,
  Gauge,
  Activity,
  Cpu,
  ChevronDown,
  ChevronUp,
  Server,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@auth/hooks/use-auth'
import { useUserGameSessions } from '@/features/user/hooks/use-user-game-sessions'
import type { MediaItemDetail } from '@/features/media/queries/media-queries'
import { formatPlaytimeHours, formatSessionRelative, isMatchingSession } from '../../utils/user-stats'

interface MediaGameUserStatsProps {
  detail: MediaItemDetail
  className?: string
}

export const MediaGameUserStats = ({ detail, className = '' }: MediaGameUserStatsProps) => {
  const { isAuthenticated } = useAuth()
  const { data: sessionData } = useUserGameSessions({ enabled: isAuthenticated })
  const [showAllSessions, setShowAllSessions] = useState(false)

  const matched = useMemo(() => {
    if (!sessionData) return null

    const all = sessionData.sessions || []
    const matching = all.filter((s) => isMatchingSession(s, detail))

    const active = sessionData.activeSession && isMatchingSession(sessionData.activeSession, detail)
      ? sessionData.activeSession
      : null

    if (matching.length === 0 && !active) {
      return null
    }

    const totalDurationSeconds = matching.reduce((acc, s) => acc + s.durationSeconds, 0) +
      (active ? active.durationSeconds : 0)

    const withFps = matching.filter((s) => s.avgFps != null && s.avgFps > 0)
    const avgFps = withFps.length > 0
      ? Math.round((withFps.reduce((acc, s) => acc + (s.avgFps || 0), 0) / withFps.length) * 10) / 10
      : active?.avgFps || null

    const withLow1 = matching.filter((s) => s.low1Percent != null && s.low1Percent > 0)
    const avgLow1 = withLow1.length > 0
      ? Math.round((withLow1.reduce((acc, s) => acc + (s.low1Percent || 0), 0) / withLow1.length) * 10) / 10
      : null

    const maxFps = matching.reduce((max, s) => Math.max(max, s.maxFps || 0), 0)

    // Identify primary node and hardware specs
    const primaryNode = active?.node?.name ||
      matching.find((s) => s.node?.name)?.node?.name ||
      'Otix Node'

    const hardwareSummary = active?.hardwareSummary ||
      matching.find((s) => s.hardwareSummary)?.hardwareSummary ||
      null

    const lastPlayed = active
      ? active.startTime || matching[0]?.startTime || null
      : matching[0]?.startTime || matching[0]?.endTime || null

    return {
      matchingSessions: matching,
      activeSession: active,
      totalDurationSeconds,
      sessionCount: matching.length + (active ? 1 : 0),
      avgFps,
      avgLow1,
      maxFps: maxFps > 0 ? Math.round(maxFps) : null,
      primaryNode,
      hardwareSummary,
      lastPlayed,
    }
  }, [sessionData, detail])

  // Only show if user is logged in and there is telemetry/session data for this game
  if (!isAuthenticated || !matched) {
    return null
  }

  const {
    matchingSessions,
    activeSession,
    totalDurationSeconds,
    sessionCount,
    avgFps,
    avgLow1,
    maxFps,
    primaryNode,
    hardwareSummary,
    lastPlayed,
  } = matched

  return (
    <div
      data-testid="media-game-user-stats-card"
      className={`glass-card p-5 sm:p-6 space-y-4 border border-[var(--dk-separator)] relative overflow-hidden ${className}`}
    >
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

      {/* Header with Title and Live status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/15 text-primary border border-primary/20">
            <Gamepad2 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight leading-none">
              Your Gameplay &amp; Benchmarks
            </h3>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Server size={11} className="text-primary/70" />
              <span>Captured on {primaryNode}</span>
            </span>
          </div>
        </div>

        {activeSession ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold animate-pulse">
            <span>Playing Now</span>
          </div>
        ) : lastPlayed ? (
          <span className="text-[11px] font-medium text-muted-foreground">
            {formatSessionRelative(lastPlayed)}
          </span>
        ) : null}
      </div>

      {/* Live Session Banner (if running right now) */}
      {activeSession && (
        <div className="p-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Current Session: </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {formatPlaytimeHours(activeSession.durationSeconds)} elapsed
              </span>
            </div>
          </div>
          {activeSession.avgFps != null && activeSession.avgFps > 0 && (
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px]">
              {Math.round(activeSession.avgFps)} FPS
            </span>
          )}
        </div>
      )}

      {/* 4-Stat Metric Grid */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        {/* Playtime */}
        <div className="p-3 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Playtime</span>
          </div>
          <p className="text-lg font-black text-foreground font-mono tracking-tight">
            {formatPlaytimeHours(totalDurationSeconds)}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            {sessionCount} recorded session{sessionCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Average FPS */}
        <div className="p-3 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Performance</span>
          </div>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
            {avgFps != null ? `${avgFps} FPS` : 'Tracking'}
          </p>
          <span className="text-[10px] text-muted-foreground block truncate">
            {avgLow1 != null ? `1% Low: ${avgLow1} FPS` : maxFps != null ? `Peak: ${maxFps} FPS` : 'Live telemetry'}
          </span>
        </div>

        {/* Benchmarks Summary */}
        <div className="p-3 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Sparkles size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Stability</span>
          </div>
          <p className="text-sm font-bold text-foreground">
            {avgLow1 != null && avgFps != null
              ? `${Math.round((avgLow1 / avgFps) * 100)}% Smoothness`
              : maxFps != null
                ? `${maxFps} FPS Peak`
                : '100% Captured'}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            {maxFps ? `Max ${maxFps} FPS` : 'Win32 Hook'}
          </span>
        </div>

        {/* Hardware Rig */}
        <div className="p-3 rounded-xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu size={12} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Battlestation</span>
          </div>
          <p className="text-xs font-semibold text-foreground truncate leading-tight mt-0.5">
            {hardwareSummary || primaryNode}
          </p>
          <span className="text-[10px] text-muted-foreground block">Hardware verified</span>
        </div>
      </div>

      {/* Session History (Expandable) */}
      {matchingSessions.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-[var(--dk-separator)]">
          <button
            type="button"
            onClick={() => setShowAllSessions(!showAllSessions)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-1 transition-colors cursor-pointer"
          >
            <span className="font-medium text-[11px] uppercase tracking-wider">
              Recent Sessions ({matchingSessions.length})
            </span>
            {showAllSessions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAllSessions && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {matchingSessions.slice(0, 10).map((sess) => (
                <div
                  key={sess.id}
                  className="p-2 rounded-lg bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] flex items-center justify-between text-xs gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground truncate block">
                      {formatPlaytimeHours(sess.durationSeconds)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSessionRelative(sess.startTime)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {sess.avgFps != null && sess.avgFps > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        {Math.round(sess.avgFps)} FPS
                      </span>
                    )}
                    {sess.node?.name && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--dk-surface-glass)] text-muted-foreground truncate max-w-[90px]">
                        {sess.node.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
};
