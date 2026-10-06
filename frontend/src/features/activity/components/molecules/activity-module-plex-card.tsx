import { useState, useReducer } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { Play, Pause, ExternalLink, Tv, Smartphone, Tablet, Laptop, Monitor } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import type { PlexSession } from '../../types'
import {
  formatTitle,
  formatEpisodeSubtitle,
  mediaTypeIcon,
  formatDevice,
  getDeviceType,
  transcodeLabel,
  formatPlaybackTime,
  formatTotalDuration,
  truncate,
} from '../../utils/plex-helpers'

const DeviceIcon = ({ device, platform }: { device?: string; platform?: string }) => {
  const type = getDeviceType(device ?? null, platform ?? null)
  switch (type) {
    case 'tv':
      return <Tv className="h-3 w-3 shrink-0 text-white/40" />
    case 'phone':
      return <Smartphone className="h-3 w-3 shrink-0 text-white/40" />
    case 'tablet':
      return <Tablet className="h-3 w-3 shrink-0 text-white/40" />
    case 'laptop':
      return <Laptop className="h-3 w-3 shrink-0 text-white/40" />
    default:
      return <Monitor className="h-3 w-3 shrink-0 text-white/40" />
  }
};

export interface ActivityModulePlexCardProps {
  s: PlexSession
  onClose?: () => void
}

export const ActivityModulePlexCard = ({ s, onClose }: ActivityModulePlexCardProps) => {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [imgError, setImgError] = useReducer(() => true, false)
  const [avatarError, setAvatarError] = useState(false)

  const { Icon } = mediaTypeIcon(s.media_type)
  const isPlaying = s.state === 'playing'
  const pct =
    s.view_offset && s.duration && s.duration > 0
      ? Math.min(100, Math.round((s.view_offset / s.duration) * 100))
      : null

  const deviceName = formatDevice(s)
  const streamBadge = transcodeLabel(s.video_decision, s.audio_decision, s.throttled)
  const isCurrentUser = currentUser?.username === s.user_name
  const totalDuration = formatTotalDuration(s.duration)
  const summary = truncate(s.summary, 120)
  const episodeSubtitle = formatEpisodeSubtitle(s)
  const displayTitle = formatTitle(s)

  const audioQuality =
    s.audio_codec && s.audio_channels
      ? `${s.audio_codec.toUpperCase()} ${s.audio_channels}.0`
      : s.audio_codec?.toUpperCase() ?? null

  const handleClick = () => {
    onClose?.()
    const targetMediaId = s.media_item_id ?? s.mediaItemId
    if (targetMediaId) {
      const rawType = s.media_type ?? s.mediaType ?? 'movie'
      const type = rawType === 'episode' ? 'show' : rawType
      navigate({
        to: '/media/$mediaType/$mediaId',
        params: { mediaType: type, mediaId: String(targetMediaId) },
      })
    } else {
      const searchTarget = s.grandparent_title ?? s.grandparentTitle ?? s.title
      navigate({
        to: '/search',
        search: { q: searchTarget } as any,
      })
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className="group relative flex flex-col gap-2.5 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      title={summary ?? undefined}
    >
      {/* Top row: User, Device, and Stream Status */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {s.user_thumb && !avatarError ? (
            <img
              src={s.user_thumb}
              alt=""
              onError={() => setAvatarError(true)}
              className="h-4 w-4 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="h-4 w-4 rounded-full flex items-center justify-center bg-amber-400/20 text-[8px] font-bold text-amber-400 uppercase shrink-0">
              {s.user_name?.charAt(0) ?? '?'}
            </div>
          )}
          <span className="text-[11px] font-medium text-white/90 truncate">
            {s.user_name}
            {isCurrentUser && (
              <span className="ml-1 text-[10px] text-amber-400/80 font-normal">(You)</span>
            )}
          </span>
          {deviceName && (
            <span className="inline-flex items-center gap-1 text-[10px] text-white/40 truncate">
              <span>·</span>
              <DeviceIcon device={s.player_device} platform={s.player_platform} />
              <span className="truncate">{deviceName}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {streamBadge ? (
            <span className="text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-md bg-amber-500/15 text-amber-400">
              {streamBadge}
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-md bg-emerald-500/15 text-emerald-400">
              Direct Play
            </span>
          )}
          <ExternalLink className="h-3 w-3 text-white/20 group-hover:text-amber-400 transition-colors" />
        </div>
      </div>

      {/* Main content: Poster + Details */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="relative shrink-0 w-12 h-16 rounded-xl overflow-hidden bg-white/[0.04] shadow-inner transition-colors">
          {s.thumb && !imgError ? (
            <img
              src={s.thumb}
              alt=""
              onError={() => setImgError()}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
              <Icon className="h-5 w-5 text-white/20" />
            </div>
          )}

          {/* Playing / Paused indicator pill */}
          <div className="absolute bottom-1 right-1 flex items-center justify-center h-4 w-4 rounded-full bg-black/70 backdrop-blur-sm">
            {isPlaying ? (
              <Play className="h-2 w-2 text-amber-400 fill-amber-400 ml-0.5" />
            ) : (
              <Pause className="h-2 w-2 text-white/60 fill-white/60" />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="text-xs font-bold text-white/95 group-hover:text-amber-300 transition-colors truncate leading-snug">
            {displayTitle}
          </p>

          {episodeSubtitle && (
            <p className="text-[11px] text-white/50 truncate mt-0.5 font-medium leading-tight">
              {episodeSubtitle}
            </p>
          )}

          {/* Media specs row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {s.year && (
              <span className="text-[10px] text-white/40 tabular-nums font-mono">{s.year}</span>
            )}
            {s.video_resolution && (
              <span className="text-[9px] px-1 py-0.5 rounded font-mono font-semibold bg-white/[0.06] text-white/60">
                {s.video_resolution === '4k' ? '4K' : `${s.video_resolution}p`}
              </span>
            )}
            {audioQuality && (
              <span className="text-[9px] px-1 py-0.5 rounded font-mono font-medium bg-white/[0.04] text-white/50">
                {audioQuality}
              </span>
            )}
            {totalDuration && !episodeSubtitle && (
              <span className="text-[10px] text-white/30 tabular-nums">· {totalDuration}</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar and time readout */}
      {pct != null && (
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="h-1 rounded-full overflow-hidden bg-white/[0.06] relative">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-[#e5a00d]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-white/40">
            <span>{formatPlaybackTime(s.view_offset)}</span>
            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400/80">
              {pct}%
            </span>
            <span>{formatPlaybackTime(s.duration)}</span>
          </div>
        </div>
      )}
    </div>
  )
};
