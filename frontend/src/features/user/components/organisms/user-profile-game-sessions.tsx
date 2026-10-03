import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Gamepad2,
  Clock,
  Gauge,
  Flame,
  ChevronDown,
  Server,
  Cpu,
  BarChart3,
  Lock,
  Copy,
  Check,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { useUserGameSessions, type NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { formatDuration } from '@/lib/utils'

// ── Timing & Formatters ────────────────────────────────────────────

function relativeDate(ts: number): string {
  if (!ts) return 'Recently'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullDateTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function humanPlaytime(seconds: number): string {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// ── Poster Shelf Card (Non-list, Seamless Media Card) ──────────────

function GameShelfCard({
  session,
  isLive = false,
  onClick,
}: {
  session: NormalizedPlaySession
  isLive?: boolean
  onClick: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const hasArt = session.posterUrl && !imgError

  return (
    <button
      type="button"
      data-testid={isLive ? 'user-profile-active-session' : undefined}
      onClick={onClick}
      className={`group relative w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden text-left border ${
        isLive ? 'border-emerald-500/50' : 'border-white/[0.08] hover:border-white/20'
      } bg-[#121216] shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer shrink-0 flex flex-col justify-between p-3`}
    >
      {/* Background Poster Image */}
      {hasArt ? (
        <img
          src={session.posterUrl!}
          alt={session.gameTitle}
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-indigo-950 flex flex-col items-center justify-center p-3 text-center">
          <Gamepad2 size={28} className="text-white/20 mb-2" />
        </div>
      )}

      {/* Dark Vignette Overlay for Title Legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40 pointer-events-none" />

      {/* Top Bar: Live / Duration Badge + FPS Chip */}
      <div className="relative z-10 flex items-center justify-between gap-1 w-full">
        {isLive ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-[9px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md">
            <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[10px] font-medium text-white/70 backdrop-blur-md">
            <Clock size={10} className="text-white/40" />
            {humanPlaytime(session.durationSeconds)}
          </span>
        )}

        {session.avgFps ? (
          <div className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
            <span className="font-mono font-bold text-xs text-white tabular-nums">
              {Math.round(session.avgFps)}
            </span>
            <span className="text-[8px] text-white/40 font-semibold uppercase">FPS</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Area: Game Title & Date */}
      <div className="relative z-10">
        <h4 className="font-bold text-xs sm:text-sm text-white tracking-tight leading-tight line-clamp-2 drop-shadow-sm group-hover:text-white/90">
          {session.gameTitle}
        </h4>
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/50 font-medium">
          <span>{isLive ? formatDuration(session.durationSeconds * 1000) : relativeDate(session.startTime)}</span>
          {session.node?.name && (
            <>
              <span className="text-white/20">·</span>
              <span className="font-mono truncate max-w-[80px]">{session.node.name}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Detail Modal ───────────────────────────────────────────────────

function SessionDetailModal({
  session,
  open,
  onOpenChange,
}: {
  session: NormalizedPlaySession
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [showNerdStats, setShowNerdStats] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(session, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DkDialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <div className="flex items-start gap-4 mb-5">
        {session.posterUrl ? (
          <div className="w-14 h-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
            <img src={session.posterUrl} alt={session.gameTitle} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-14 h-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <Gamepad2 size={24} className="text-white/30" />
          </div>
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-base font-bold text-white leading-tight truncate">
            {session.gameTitle}
          </h3>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            {fullDateTime(session.startTime)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1 mb-1">
            <Gauge size={11} /> Avg FPS
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-white">
            {session.avgFps ? Math.round(session.avgFps) : '—'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1 mb-1">
            <Flame size={11} /> 1% Low
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-white">
            {session.low1Percent ? Math.round(session.low1Percent) : '—'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1 mb-1">
            <Clock size={11} /> Time
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-white">
            {humanPlaytime(session.durationSeconds)}
          </p>
        </div>
      </div>

      {(session.hardwareSummary || session.node?.name) && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-white/40 shrink-0" />
            <span className="font-mono truncate">
              {session.hardwareSummary || (session.node?.name ? `Node: ${session.node.name}` : 'Desktop')}
            </span>
          </div>
          {session.node?.name && (
            <div className="mt-1 flex items-center gap-2 text-white/40 font-mono text-[11px]">
              <Server size={12} className="text-white/30 shrink-0" />
              <span>Node: {session.node.name}</span>
            </div>
          )}
        </div>
      )}

      <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.01]">
        <button
          type="button"
          data-testid="analytics-for-nerds-toggle"
          onClick={() => setShowNerdStats(!showNerdStats)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-white/50 hover:text-white/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={14} />
            <span>Analytics for Nerds</span>
          </div>
          <ChevronDown size={14} className={`transition-transform duration-200 ${showNerdStats ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showNerdStats && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/[0.06] p-3.5 space-y-2 font-mono text-xs"
              data-testid="nerd-stats-panel"
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                {session.minFps != null && session.maxFps != null && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1">
                    <span className="text-white/40">FPS Spread</span>
                    <span className="text-white font-bold">{Math.round(session.minFps)} – {Math.round(session.maxFps)}</span>
                  </div>
                )}
                {session.low01Percent != null && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1">
                    <span className="text-white/40">0.1% Low</span>
                    <span className="text-white font-bold">{Math.round(session.low01Percent)} FPS</span>
                  </div>
                )}
                {session.totalFrames != null && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1">
                    <span className="text-white/40">Total Frames</span>
                    <span className="text-white font-bold">{session.totalFrames.toLocaleString()}</span>
                  </div>
                )}
                {session.loadingSeconds != null && session.loadingSeconds > 0 && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1">
                    <span className="text-white/40">Loading Time</span>
                    <span className="text-white font-bold">{session.loadingSeconds}s</span>
                  </div>
                )}
                {session.backgroundSeconds != null && session.backgroundSeconds > 0 && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1">
                    <span className="text-white/40">Background Idle</span>
                    <span className="text-white font-bold">{session.backgroundSeconds}s</span>
                  </div>
                )}
                {session.processName && (
                  <div className="flex justify-between border-b border-white/[0.04] pb-1 col-span-2">
                    <span className="text-white/40">Process</span>
                    <span className="text-white/70 font-mono text-[10px] truncate max-w-[280px]">{session.processName}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white/60 text-[10px] cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DkDialog>
  )
}

// ── Main UserProfileGameSessions Organism ──────────────────────────

interface UserProfileGameSessionsProps {
  username: string
}

export function UserProfileGameSessions({ username: _username }: UserProfileGameSessionsProps) {
  const { data, isLoading } = useUserGameSessions()
  const [selectedSession, setSelectedSession] = useState<NormalizedPlaySession | null>(null)

  const sessions = useMemo(() => data?.sessions || [], [data?.sessions])
  const totalHours = data ? Math.floor(data.totalDurationSeconds / 3600) : 0

  const summaryParts: string[] = []
  if (!isLoading && data) {
    if (data.totalSessions > 0) {
      summaryParts.push(`${data.totalSessions} session${data.totalSessions !== 1 ? 's' : ''}`)
    }
    if (data.totalDurationSeconds > 0) {
      summaryParts.push(`${totalHours > 0 ? `${totalHours}h` : ''} played`)
    }
    if (data.overallAvgFps) {
      summaryParts.push(`${Math.round(data.overallAvgFps)} avg FPS`)
    }
  }

  return (
    <div data-testid="user-profile-game-sessions" className="w-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 mb-3.5 px-0.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
            <Gamepad2 className="h-3.5 w-3.5 text-white/40" />
            Game Sessions
          </span>
          {summaryParts.length > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-white/40 font-medium">
                {summaryParts.join(' · ')}
              </span>
            </>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/35">
          <Lock className="h-3 w-3 text-white/30" />
          Private
        </span>
      </div>

      {/* Empty State */}
      {sessions.length === 0 && !data?.activeSession ? (
        <div className="py-10 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.01]">
          <Gamepad2 size={28} className="text-white/15 mb-2" />
          <h3 className="text-xs font-semibold text-white/60 mb-0.5">
            No sessions yet
          </h3>
          <p className="text-[11px] text-white/30 max-w-xs">
            Launch games through Otix to automatically track your gaming sessions.
          </p>
        </div>
      ) : (
        /* Horizontal Media Shelf (Zero List Look) */
        <div className="relative">
          <div className="flex items-center gap-3.5 overflow-x-auto pb-2 pt-0.5 scrollbar-none">
            {/* Active Live Session placed first on the shelf */}
            {data?.activeSession && (
              <GameShelfCard
                session={data.activeSession}
                isLive
                onClick={() => setSelectedSession(data.activeSession!)}
              />
            )}

            {/* Completed Sessions Shelf */}
            {sessions.map((sess: NormalizedPlaySession) => (
              <GameShelfCard
                key={sess.id}
                session={sess}
                onClick={() => setSelectedSession(sess)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Detail Dossier Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          open={!!selectedSession}
          onOpenChange={(open) => {
            if (!open) setSelectedSession(null)
          }}
        />
      )}
    </div>
  )
}
