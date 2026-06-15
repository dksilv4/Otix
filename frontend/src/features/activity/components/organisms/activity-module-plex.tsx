import { useState, useRef, useEffect, useCallback, useReducer } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Tv } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/providers/auth'
import { useFeature } from '@/features/_config'
import { useDesktopPlatform } from '@/lib/desktop/platform'

export interface PlexSession {
  session_id: string
  media_type: string
  title: string
  grandparent_title: string | null
  parent_title: string | null
  index: number | null
  thumb: string | null
  duration: number | null
  view_offset: number | null
  state: string
  user_name: string
  user_thumb: string | null
  player_title: string | null
  player_device: string | null
  player_platform: string | null
  server_name: string
  server_id: string
  library_section: string | null
  year: number | null
  content_rating: string | null
  summary: string | null
  video_resolution: string | null
  video_codec: string | null
  audio_codec: string | null
  audio_channels: number | null
  bitrate: number | null
  video_decision: string | null
  audio_decision: string | null
  transcode_reason: string | null
  throttled: boolean
}

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

// ── helpers ──────────────────────────────────────────────────────────

function formatTitle(s: PlexSession): string {
  if (s.media_type === 'episode' && s.grandparent_title) {
    const ep = s.index != null ? `E${s.index}` : ''
    return `${s.grandparent_title} ${ep}`.trim()
  }
  return s.title
}

function formatEpisodeMeta(s: PlexSession): string | null {
  if (s.media_type !== 'episode') return null
  if (!s.parent_title && s.index == null) return null
  const season = s.parent_title ? s.parent_title.replace('Season ', 'S') : ''
  const ep = s.index != null ? `E${s.index}` : ''
  return `${season}${ep}`.trim() || null
}

const mediaTypeIcon = (type: string) => {
  switch (type) {
    case 'movie': return { Icon: Film, label: 'Movie' }
    case 'episode': return { Icon: Tv, label: 'Show' }
    default: return { Icon: Film, label: type }
  }
}

function formatDevice(s: PlexSession): string | null {
  return s.player_device || s.player_platform || null
}

function transcodeLabel(videoDecision: string | null, audioDecision: string | null, throttled: boolean): string | null {
  const isDirectVideo = !videoDecision || videoDecision === 'direct play'
  const isDirectAudio = !audioDecision || audioDecision === 'direct play'
  if (isDirectVideo && isDirectAudio) return null
  if (!isDirectVideo) return 'Transcode'
  if (throttled) return 'Throttled'
  return null
}

function formatTotalDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function truncate(str: string | null, max: number): string | null {
  if (!str) return null
  if (str.length <= max) return str
  return str.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

// ── session card ─────────────────────────────────────────────────────

function SessionCard({ s }: { s: PlexSession }) {
  const { user: currentUser } = useAuth()
  const [imgError, setImgError] = useReducer(_ => true, false)
  const { Icon } = mediaTypeIcon(s.media_type)
  const isPlaying = s.state === 'playing'
  const pct = s.view_offset && s.duration && s.duration > 0
    ? Math.min(100, Math.round((s.view_offset / s.duration) * 100))
    : null
  const device = formatDevice(s)
  const streamBadge = transcodeLabel(s.video_decision, s.audio_decision, s.throttled)
  const isCurrentUser = currentUser?.username === s.user_name || currentUser?.displayName === s.user_name
  const totalDuration = formatTotalDuration(s.duration)
  const summary = truncate(s.summary, 110)
  const audioQuality = s.audio_codec && s.audio_channels
    ? `${s.audio_codec.toUpperCase()} ${s.audio_channels}.0`
    : s.audio_codec?.toUpperCase() ?? null

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-150 hover:bg-white/[0.05]">
      {/* poster */}
      <div className="shrink-0 relative self-start">
        {s.thumb && !imgError ? (
          <img
            src={s.thumb}
            alt=""
            onError={() => setImgError()}
            className="rounded-lg object-cover bg-white/[0.04] h-20 w-[3.75rem]"
          />
        ) : (
          <div className="rounded-lg flex items-center justify-center bg-white/[0.04] h-20 w-[3.75rem]">
            <Icon className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}

        {/* state dot */}
        {isPlaying && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 rounded-full bg-[#e5a00d] shadow-[0_0_0_2px_rgba(0,0,0,0.9)]" />
        )}
      </div>

      {/* info */}
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        {/* user row */}
        <div className="flex items-center gap-2">
          {s.user_thumb ? (
            <img src={s.user_thumb} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
          ) : (
            <div className="h-5 w-5 rounded-full flex items-center justify-center bg-amber-400/20 text-[9px] font-bold text-amber-400 uppercase">
              {s.user_name?.charAt(0) ?? '?'}
            </div>
          )}
          <span className="text-xs font-medium text-white/80 truncate">{s.user_name}</span>
          {isCurrentUser && (
            <span className="text-[10px] font-medium text-amber-400/70">(You)</span>
          )}
          {device && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-white/40 truncate">{device}</span>
            </>
          )}
        </div>

        {/* media type + year + duration + badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
            {s.media_type === 'movie' ? 'Movie' : s.media_type === 'episode' ? 'Show' : s.media_type}
          </span>
          {s.year && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{s.year}</span>
          )}
          {s.content_rating && (
            <span className="text-[10px] px-1 py-px font-semibold rounded bg-white/[0.06] text-muted-foreground/50 leading-none">
              {s.content_rating}
            </span>
          )}
          {s.video_resolution && (
            <span className="text-[10px] font-medium text-muted-foreground/50">
              {s.video_resolution === '4k' ? '4K' : s.video_resolution + 'p'}
            </span>
          )}
          {totalDuration && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{totalDuration}</span>
          )}
          {streamBadge && (
            <span className={cn(
              'text-[10px] px-1.5 font-medium py-px rounded-full',
              'bg-amber-500/10 text-amber-400/70',
            )}>
              {streamBadge}
            </span>
          )}
        </div>

        {/* title */}
        <p className="text-sm font-semibold leading-snug truncate text-white/90">
          {formatTitle(s)}
        </p>

        {/* episode subtitle */}
        {s.media_type === 'episode' && s.title && (
          <p className="text-[11px] text-muted-foreground/60 truncate leading-tight">
            {formatEpisodeMeta(s) && (
              <span className="text-muted-foreground/40 tabular-nums mr-1">{formatEpisodeMeta(s)}</span>
            )}
            {s.title}
          </p>
        )}

        {/* server + quality tags + progress row */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground/30 truncate max-w-[80px]">{s.server_name}</span>
          {audioQuality && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-muted-foreground/40 truncate">{audioQuality}</span>
            </>
          )}
          {s.transcode_reason && streamBadge === 'Transcode' && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-muted-foreground/30 truncate max-w-[80px]">{s.transcode_reason}</span>
            </>
          )}
          {s.library_section && (
            <>
              <span className="text-[10px] text-white/20">·</span>
              <span className="text-[10px] text-muted-foreground/30 truncate max-w-[100px]">{s.library_section}</span>
            </>
          )}
        </div>

        {/* progress bar */}
        {pct != null && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-[#e5a00d]"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isPlaying && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#e5a00d] animate-pulse" />
              )}
              <span className="text-[10px] text-muted-foreground/50 tabular-nums font-mono">{pct}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── session list ─────────────────────────────────────────────────────

/** Animated list of active Plex streaming sessions with per-session cards. */
export function PlexSessionList({ sessions }: { sessions: PlexSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground/50">
        No active sessions
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s, i) => (
        <motion.div
          key={s.session_id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
        >
          <SessionCard s={s} />
        </motion.div>
      ))}
    </div>
  )
}

// ── standalone Plex pill (kept for direct use elsewhere) ─────────────

/** Standalone Plex activity toggle pill with a popover showing active streaming sessions. */
export function ActivityModulePlex() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isDesktop } = useDesktopPlatform()
  const { user: currentUser } = useAuth()
  const plexEnabled = useFeature('integration:plex')

  if (!plexEnabled) return null

  const { data } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: !!currentUser?.plexId,
  })

  const sessions = data ?? []
  const count = sessions.length

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-plex-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false)
    })
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  if (count === 0 && !open) return null

  return (
    <>
      <button
        type="button"
        data-plex-trigger
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center p-1.5 relative cursor-pointer rounded-[2rem] backdrop-blur-[16px]',
          count > 0 && 'shadow-[0_0_0_1px_rgba(229,160,13,0.4)]',
        )}
        style={{
          background: 'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: count > 0
            ? 'var(--dk-shadow-glass), 0 0 0 1px rgba(229,160,13,0.4)'
            : 'var(--dk-shadow-glass)',
        }}
        aria-label="Plex now playing"
      >
        <PlexIcon className={cn('h-5 w-5', count > 0 ? 'text-[#e5a00d]' : 'text-muted-foreground')} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold leading-none text-[10px] text-black bg-[#e5a00d]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed right-4 z-[9999] w-80 max-h-[32rem] overflow-y-auto p-3 flex flex-col gap-2 rounded-[1.5rem]',
              isDesktop ? 'top-[110px]' : 'top-18',
            )}
            style={{
              background: 'var(--dk-surface-overlay)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: 'var(--dk-shadow-glass)',
            }}
          >
            <PlexSessionList sessions={sessions} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
