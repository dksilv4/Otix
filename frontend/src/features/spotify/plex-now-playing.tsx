import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Pause, Play, Film, Tv, Music, User, Monitor, HardDrive, Zap } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { cn } from '@/lib/utils'

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
    case 'track': return { Icon: Music, label: 'Track' }
    default: return { Icon: Film, label: type }
  }
}

function formatBitrate(kbps: number | null): string | null {
  if (!kbps) return null
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${kbps} Kbps`
}

function formatChannelLabel(ch: number | null): string | null {
  if (!ch) return null
  if (ch === 2) return 'Stereo'
  if (ch === 6) return '5.1'
  if (ch === 8) return '7.1'
  return `${ch}.0`
}

function transcodeLabel(videoDecision: string | null, audioDecision: string | null, throttled: boolean): string | null {
  const isDirectVideo = !videoDecision || videoDecision === 'direct play'
  const isDirectAudio = !audioDecision || audioDecision === 'direct play'
  if (isDirectVideo && isDirectAudio) return 'Direct Play'
  const parts: string[] = []
  if (!isDirectVideo) parts.push('Transcode')
  else if (throttled) parts.push('Throttled')
  if (isDirectAudio && !isDirectVideo && throttled) return 'Throttled'
  return parts.join(' · ') || null
}

// ── session card ─────────────────────────────────────────────────────

function SessionCard({ s }: { s: PlexSession }) {
  const [imgError, setImgError] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const { Icon } = mediaTypeIcon(s.media_type)
  const isPlaying = s.state === 'playing'
  const pct = s.view_offset && s.duration && s.duration > 0
    ? Math.min(100, Math.round((s.view_offset / s.duration) * 100))
    : null

  const streamBadge = transcodeLabel(s.video_decision, s.audio_decision, s.throttled)

  return (
    <div
      className={cn(
        'flex gap-3 p-3 rounded-2xl transition-all',
        'bg-white/[0.02] hover:bg-white/[0.05]',
        'ring-1 ring-white/[0.04]',
      )}
    >
      {/* poster */}
      <div className="shrink-0 relative">
        {s.thumb && !imgError ? (
          <img
            src={s.thumb}
            alt=""
            onError={() => setImgError(true)}
            className={cn(
              'rounded-lg object-cover bg-white/[0.04]',
              s.media_type === 'track' ? 'h-14 w-14' : 'h-[5rem] w-[3.75rem]',
            )}
          />
        ) : (
          <div
            className={cn(
              'rounded-lg bg-white/[0.04] flex items-center justify-center',
              s.media_type === 'track' ? 'h-14 w-14' : 'h-[5rem] w-[3.75rem]',
            )}
          >
            <Icon className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}

        {/* state dot overlay */}
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5',
            'h-[1.15rem] w-[1.15rem] rounded-full flex items-center justify-center',
            'ring-2 ring-black/90',
            isPlaying ? 'bg-[#e5a00d]' : 'bg-muted-foreground/50',
          )}
        >
          {isPlaying ? (
            <Play className="h-[9px] w-[9px] text-black" fill="black" />
          ) : (
            <Pause className="h-[9px] w-[9px] text-black" />
          )}
        </div>
      </div>

      {/* info */}
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        {/* meta chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
            {mediaTypeIcon(s.media_type).label}
          </span>
          {s.year && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">{s.year}</span>
          )}
          {s.content_rating && (
            <span className="text-[10px] px-1 rounded-sm bg-white/[0.06] text-muted-foreground/50 font-medium">
              {s.content_rating}
            </span>
          )}
          {s.library_section && (
            <span className="text-[10px] text-muted-foreground/30 truncate max-w-[120px]">
              {s.library_section}
            </span>
          )}
        </div>

        {/* title */}
        <p className="text-sm font-semibold leading-snug truncate">
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

        {/* movie summary (expandable) */}
        {s.summary && s.media_type === 'movie' && (
          <div className="mt-0.5">
            <button
              type="button"
              onClick={() => setShowSummary(!showSummary)}
              className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
            >
              {showSummary ? 'Hide' : 'Summary'}
            </button>
            {showSummary && (
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed mt-0.5 line-clamp-3">
                {s.summary}
              </p>
            )}
          </div>
        )}

        {/* user + server + device */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {s.user_thumb ? (
            <img src={s.user_thumb} alt="" className="h-4 w-4 rounded-full object-cover" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-white/[0.06] flex items-center justify-center">
              <User className="h-2.5 w-2.5 text-muted-foreground/40" />
            </div>
          )}
          <span className="text-[11px] text-muted-foreground/70 truncate">{s.user_name}</span>
          <span className="text-[10px] text-muted-foreground/25">on</span>
          <HardDrive className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
          <span className="text-[11px] text-muted-foreground/40 truncate">{s.server_name}</span>
          {(s.player_device || s.player_platform) && (
            <>
              <span className="text-[10px] text-muted-foreground/25">·</span>
              <Monitor className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
              <span className="text-[10px] text-muted-foreground/30 truncate">
                {s.player_device || s.player_platform}
              </span>
            </>
          )}
        </div>

        {/* progress */}
        {pct != null && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  isPlaying ? 'bg-[#e5a00d]' : 'bg-muted-foreground/30',
                )}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums font-mono shrink-0 min-w-[2.5rem] text-right">
              {pct}%
            </span>
          </div>
        )}

        {/* stream details */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {s.video_resolution && (
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {s.video_resolution === '4k' ? '4K' : s.video_resolution + 'p'}
            </span>
          )}
          {s.video_codec && (
            <span className="text-[10px] text-muted-foreground/40 uppercase">{s.video_codec}</span>
          )}
          {s.audio_channels != null && (
            <span className="text-[10px] text-muted-foreground/40">
              {formatChannelLabel(s.audio_channels)}
            </span>
          )}
          {s.audio_codec && (
            <span className="text-[10px] text-muted-foreground/40 uppercase">{s.audio_codec}</span>
          )}
          {formatBitrate(s.bitrate) && (
            <span className="text-[10px] text-muted-foreground/30">{formatBitrate(s.bitrate)}</span>
          )}
          {streamBadge && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-px rounded-full font-medium',
                streamBadge === 'Direct Play' ? 'bg-emerald-500/10 text-emerald-400/70' : 'bg-amber-500/10 text-amber-400/70',
              )}
            >
              {streamBadge}
            </span>
          )}
          {s.transcode_reason && (
            <span className="text-[10px] text-muted-foreground/30 italic truncate max-w-[140px]">
              {s.transcode_reason}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── session list ─────────────────────────────────────────────────────

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

export function PlexNowPlaying() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/auth/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
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
          'flex items-center rounded-[2rem] p-1.5 relative cursor-pointer',
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
          'backdrop-blur-lg',
          'shadow-[var(--dk-shadow-glass)]',
          count > 0 && 'ring-1 ring-[#e5a00d]/40',
        )}
        aria-label="Plex now playing"
      >
        <PlexIcon className={cn('h-5 w-5', count > 0 ? 'text-[#e5a00d]' : 'text-muted-foreground')} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e5a00d] px-1 text-[10px] font-bold text-black leading-none">
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
              'fixed top-[4.5rem] right-4 z-[9999]',
              'w-80 max-h-[32rem] overflow-y-auto p-3 rounded-[1.5rem]',
              'bg-[var(--dk-surface-overlay)]',
              'backdrop-blur-xl',
              'shadow-[var(--dk-shadow-glass)]',
              'flex flex-col gap-2',
            )}
          >
            <p className="px-2 text-sm font-semibold">Plex Sessions</p>
            <PlexSessionList sessions={sessions} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
