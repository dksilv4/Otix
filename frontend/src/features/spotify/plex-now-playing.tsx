import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Pause, Play, Film, Tv, Music, User, Monitor, HardDrive } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useDesktopPlatform } from '@/lib/desktop-platform'
import './plex-now-playing.scss'

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
    <div className="dk-plex__card">
      {/* poster */}
      <div className="dk-plex__card-poster">
        {s.thumb && !imgError ? (
          <img
            src={s.thumb}
            alt=""
            onError={() => setImgError(true)}
            className={cn(
              'dk-plex__card-poster-img',
              s.media_type === 'track' ? 'dk-plex__card-poster-img--track' : 'dk-plex__card-poster-img--video',
            )}
          />
        ) : (
          <div
            className={cn(
              'dk-plex__card-poster-fallback',
              s.media_type === 'track' ? 'dk-plex__card-poster-fallback--track' : 'dk-plex__card-poster-fallback--video',
            )}
          >
            <Icon className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}

        {/* state dot overlay */}
        <div
          className={cn(
            'dk-plex__card-state-dot',
            isPlaying ? 'dk-plex__card-state-dot--playing' : 'dk-plex__card-state-dot--paused',
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
      <div className="dk-plex__card-info">
        {/* meta chips */}
        <div className="dk-plex__card-meta">
          <span className="dk-plex__card-meta-chip">
            {mediaTypeIcon(s.media_type).label}
          </span>
          {s.year && (
            <span className="dk-plex__card-meta-year">{s.year}</span>
          )}
          {s.content_rating && (
            <span className="dk-plex__card-meta-rating">
              {s.content_rating}
            </span>
          )}
          {s.library_section && (
            <span className="dk-plex__card-meta-section">
              {s.library_section}
            </span>
          )}
        </div>

        {/* title */}
        <p className="dk-plex__card-title">
          {formatTitle(s)}
        </p>

        {/* episode subtitle */}
        {s.media_type === 'episode' && s.title && (
          <p className="dk-plex__card-subtitle">
            {formatEpisodeMeta(s) && (
              <span className="dk-plex__card-subtitle-ep">{formatEpisodeMeta(s)}</span>
            )}
            {s.title}
          </p>
        )}

        {/* movie summary (expandable) */}
        {s.summary && s.media_type === 'movie' && (
          <div className="dk-plex__card-summary-wrap">
            <button
              type="button"
              onClick={() => setShowSummary(!showSummary)}
              className="dk-plex__card-summary-toggle"
            >
              {showSummary ? 'Hide' : 'Summary'}
            </button>
            {showSummary && (
              <p className="dk-plex__card-summary">
                {s.summary}
              </p>
            )}
          </div>
        )}

        {/* user + server + device */}
        <div className="dk-plex__card-meta-row">
          {s.user_thumb ? (
            <img src={s.user_thumb} alt="" className="dk-plex__card-meta-avatar" />
          ) : (
            <div className="dk-plex__card-meta-avatar-fallback">
              <User className="h-2.5 w-2.5 text-muted-foreground/40" />
            </div>
          )}
          <span className="dk-plex__card-meta-name">{s.user_name}</span>
          <span className="dk-plex__card-meta-label">on</span>
          <HardDrive className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
          <span className="dk-plex__card-meta-server">{s.server_name}</span>
          {(s.player_device || s.player_platform) && (
            <>
              <span className="dk-plex__card-meta-label">·</span>
              <Monitor className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
              <span className="dk-plex__card-meta-device">
                {s.player_device || s.player_platform}
              </span>
            </>
          )}
        </div>

        {/* progress */}
        {pct != null && (
          <div className="dk-plex__card-progress">
            <div className="dk-plex__card-progress-track">
              <motion.div
                className={cn(
                  'dk-plex__card-progress-fill',
                  isPlaying ? 'dk-plex__card-progress-fill--playing' : 'dk-plex__card-progress-fill--paused',
                )}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="dk-plex__card-progress-label">
              {pct}%
            </span>
          </div>
        )}

        {/* stream details */}
        <div className="dk-plex__card-stream">
          {s.video_resolution && (
            <span className="dk-plex__card-stream-chip dk-plex__card-stream-chip--emph">
              {s.video_resolution === '4k' ? '4K' : s.video_resolution + 'p'}
            </span>
          )}
          {s.video_codec && (
            <span className="dk-plex__card-stream-chip dk-plex__card-stream-chip--codec">{s.video_codec}</span>
          )}
          {s.audio_channels != null && (
            <span className="dk-plex__card-stream-chip">
              {formatChannelLabel(s.audio_channels)}
            </span>
          )}
          {s.audio_codec && (
            <span className="dk-plex__card-stream-chip dk-plex__card-stream-chip--codec">{s.audio_codec}</span>
          )}
          {formatBitrate(s.bitrate) && (
            <span className="dk-plex__card-stream-chip dk-plex__card-stream-chip--dim">{formatBitrate(s.bitrate)}</span>
          )}
          {streamBadge && (
            <span
              className={cn(
                'dk-plex__card-stream-badge',
                streamBadge === 'Direct Play' ? 'dk-plex__card-stream-badge--direct' : 'dk-plex__card-stream-badge--transcoded',
              )}
            >
              {streamBadge}
            </span>
          )}
          {s.transcode_reason && (
            <span className="dk-plex__card-stream-reason">
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
      <p className="dk-plex__empty">
        No active sessions
      </p>
    )
  }

  return (
    <div className="dk-plex__session-list">
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
  const { isDesktop } = useDesktopPlatform()

  const { user: currentUser } = useAuth()

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
          'dk-plex__trigger',
          count > 0 && 'dk-plex__trigger--active',
        )}
        aria-label="Plex now playing"
      >
        <PlexIcon className={cn('h-5 w-5', count > 0 ? 'text-[#e5a00d]' : 'text-muted-foreground')} />
        {count > 0 && (
          <span className="dk-plex__badge">
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
              'dk-plex__dropdown',
              isDesktop ? 'dk-plex__dropdown--desktop' : 'dk-plex__dropdown--mobile',
            )}
          >
            <p className="dk-plex__dropdown-title">Plex Sessions</p>
            <PlexSessionList sessions={sessions} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
