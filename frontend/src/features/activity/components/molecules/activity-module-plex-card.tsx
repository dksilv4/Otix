import { useState, useReducer } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/providers/auth'
import type { PlexSession } from '../../types'
import {
  formatTitle,
  formatEpisodeMeta,
  mediaTypeIcon,
  formatDevice,
  transcodeLabel,
  formatTotalDuration,
  truncate,
} from '../../utils/plex-helpers'

interface ActivityModulePlexCardProps {
  s: PlexSession
}

export function ActivityModulePlexCard({ s }: ActivityModulePlexCardProps) {
  const { user: currentUser } = useAuth()
  const [imgError, setImgError] = useReducer(_ => true, false)
  const [avatarError, setAvatarError] = useState(false)

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
    <div className="flex gap-3 p-3 rounded-xl bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-all duration-150 hover:bg-white/[0.05]" title={summary ?? undefined}>
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
          {s.user_thumb && !avatarError ? (
            <img
              src={s.user_thumb}
              alt=""
              onError={() => setAvatarError(true)}
              className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10"
            />
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
