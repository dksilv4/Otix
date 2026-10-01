import { useState, useMemo } from 'react'
import {
  Activity,
  Lock,
  Clock,
  Gauge,
  Flame,
  Gamepad2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useUserGameSessions, type NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { formatDuration } from '@/lib/utils'

interface UserProfileGameSessionsProps {
  username: string
}

function formatSessionDate(ts: number): string {
  if (!ts) return 'Recent'
  const date = new Date(ts)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getFpsColor(fps: number | null): { text: string; bg: string; border: string } {
  if (!fps) return { text: 'text-white/60', bg: 'bg-white/5', border: 'border-white/10' }
  if (fps >= 100) return { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' }
  if (fps >= 60) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
  if (fps >= 30) return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
  return { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' }
}

export function UserProfileGameSessions({ username: _username }: UserProfileGameSessionsProps) {
  const { data, isLoading } = useUserGameSessions()
  const [showAll, setShowAll] = useState(false)

  const sessions = useMemo(() => data?.sessions || [], [data?.sessions])
  const displayedSessions = useMemo(() => {
    return showAll ? sessions : sessions.slice(0, 5)
  }, [sessions, showAll])

  const totalHours = data ? Math.floor(data.totalDurationSeconds / 3600) : 0
  const totalMins = data ? Math.floor((data.totalDurationSeconds % 3600) / 60) : 0
  const playtimeStr = totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`

  const avgFpsColor = getFpsColor(data?.overallAvgFps ?? null)

  return (
    <div
      data-testid="user-profile-game-sessions"
      className="mt-8 relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl p-6 shadow-2xl transition-all duration-300 hover:border-white/[0.12]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-inner">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Gaming Performance & Sessions
            </h2>
            <p className="text-xs text-white/50">
              Hardware frame rates, 1% lows, and gameplay duration history
            </p>
          </div>
        </div>

        {/* Private Privacy Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold backdrop-blur-md shadow-sm">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>Private to you</span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {/* Total Sessions */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sessions</span>
            <Gamepad2 size={14} />
          </div>
          <p className="text-2xl font-black text-white tabular-nums">
            {isLoading ? '...' : data?.totalSessions ?? 0}
          </p>
        </div>

        {/* Tracked Playtime */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Playtime</span>
            <Clock size={14} />
          </div>
          <p className="text-2xl font-black text-white tabular-nums">
            {isLoading ? '...' : (data?.totalDurationSeconds ?? 0) > 0 ? playtimeStr : '—'}
          </p>
        </div>

        {/* Overall Avg FPS */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg FPS</span>
            <Gauge size={14} />
          </div>
          <p className={`text-2xl font-black tabular-nums ${avgFpsColor.text}`}>
            {isLoading ? '...' : data?.overallAvgFps ? `${Math.round(data.overallAvgFps)}` : '—'}
          </p>
        </div>

        {/* Average 1% Low */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg 1% Low</span>
            <Flame size={14} />
          </div>
          <p className="text-2xl font-black text-white/90 tabular-nums">
            {isLoading ? '...' : data?.overallAvgLow1 ? `${Math.round(data.overallAvgLow1)} FPS` : '—'}
          </p>
        </div>
      </div>

      {/* Session History List */}
      {sessions.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01]">
          <Gamepad2 size={36} className="text-white/20 mb-3" />
          <h3 className="text-sm font-semibold text-white/80 mb-1">
            No gaming sessions recorded yet
          </h3>
          <p className="text-xs text-white/40 max-w-sm">
            Launch games through the Otix Desktop App or Otix Node to automatically benchmark and track your
            frame rates, 1% lows, and play history.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-white/40 px-3 pb-1">
            <span>Recent Sessions ({sessions.length})</span>
            <span>Performance Breakdown</span>
          </div>

          {displayedSessions.map((sess: NormalizedPlaySession) => {
            const colors = getFpsColor(sess.avgFps)
            const durationMs = sess.durationSeconds * 1000

            return (
              <div
                key={sess.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all"
              >
                {/* Game Title & Time */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white/95 truncate">
                      {sess.gameTitle}
                    </h4>
                    {sess.processName && (
                      <span className="text-[10px] font-mono text-white/30 hidden md:inline">
                        ({sess.processName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/45 mt-0.5">
                    <span>{formatSessionDate(sess.startTime)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 font-mono text-white/60">
                      <Clock size={11} />
                      {formatDuration(durationMs)}
                    </span>
                  </div>
                </div>

                {/* FPS Badges */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {sess.avgFps ? (
                    <div className={`px-2.5 py-1 rounded-lg border ${colors.bg} ${colors.border} flex items-center gap-1.5`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">AVG</span>
                      <span className={`font-mono font-bold text-sm ${colors.text}`}>
                        {Math.round(sess.avgFps)} FPS
                      </span>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40">
                      No FPS data
                    </div>
                  )}

                  {sess.low1Percent && (
                    <div className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-white/75" title="1% Low FPS">
                      <span className="text-[10px] text-white/40 mr-1 font-sans">1%</span>
                      {Math.round(sess.low1Percent)}
                    </div>
                  )}

                  {sess.minFps && sess.maxFps && (
                    <div className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono text-white/50 hidden lg:inline-block" title="Min / Max FPS Range">
                      {Math.round(sess.minFps)}–{Math.round(sess.maxFps)}
                    </div>
                  )}

                  {sess.totalFrames && sess.totalFrames > 0 && (
                    <div className="text-[11px] font-mono text-white/30 hidden xl:inline-block">
                      {sess.totalFrames >= 1000 ? `${(sess.totalFrames / 1000).toFixed(0)}k frames` : `${sess.totalFrames} frames`}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {sessions.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="w-full mt-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/50 hover:text-white hover:bg-white/[0.02] rounded-xl transition-colors"
            >
              {showAll ? (
                <>
                  <span>Show Less</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span>Show All ({sessions.length}) Sessions</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
