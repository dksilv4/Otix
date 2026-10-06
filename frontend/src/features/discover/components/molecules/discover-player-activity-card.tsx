import { Link } from '@tanstack/react-router'
import { Zap, Gamepad2, Film, Tv, Music } from 'lucide-react'
import { DkAvatar } from '@ui/atoms/avatar'
import { formatDuration } from '@/lib/utils'

export type LiveActivityMediaType = 'game' | 'movie' | 'show' | 'music'

export interface LiveMediaActivityItem {
  id: string
  mediaType: LiveActivityMediaType
  mediaId?: string | null
  title: string
  subtitle?: string | null
  user: {
    id?: string
    username: string
    avatarUrl?: string | null
  }
  posterUrl?: string | null
  backdropUrl?: string | null
  textlessPosterUrl?: string | null
  elapsedMs?: number
  durationMs?: number
  fps?: number | null
  sessionXp?: number
}

// Backward compatibility alias
export type PlayerActivityItem = LiveMediaActivityItem

interface DiscoverPlayerActivityCardProps {
  item: LiveMediaActivityItem
}

const MediaIcon = ({ type }: { type: LiveActivityMediaType }) => {
  switch (type) {
    case 'game':
      return <Gamepad2 className="w-3.5 h-3.5 text-media-game" />
    case 'movie':
      return <Film className="w-3.5 h-3.5 text-media-movie" />
    case 'show':
      return <Tv className="w-3.5 h-3.5 text-media-show" />
    case 'music':
      return <Music className="w-3.5 h-3.5 text-media-music" />
    default:
      return null
  }
}

/**
 * Standardised full-bleed borderless live activity card in Discover.
 * Supports any active media (playing games, watching movies/shows, listening to music).
 * Links directly to the media detail page.
 */
export const DiscoverPlayerActivityCard = ({ item }: DiscoverPlayerActivityCardProps) => {
  const displayArt = item.backdropUrl || item.textlessPosterUrl || item.posterUrl
  const fpsRounded = item.fps ? Math.round(item.fps) : null
  const targetMediaType = item.mediaType === 'music' ? 'music' : item.mediaType

  return (
    <div
      data-testid="discover-player-activity-card"
      className="w-[260px] h-[370px] rounded-3xl overflow-hidden relative shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col justify-between p-4 group shrink-0 transition-transform duration-300 hover:scale-[1.02] select-none bg-card"
    >
      {/* Edge-to-edge textless artwork background */}
      {displayArt ? (
        <div
          className="absolute inset-0 bg-cover bg-center scale-100 group-hover:scale-105 transition-transform duration-700 pointer-events-none"
          style={{ backgroundImage: `url(${displayArt})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-card pointer-events-none" />
      )}

      {/* Atmospheric Vignette Gradients (Rule 1: No borders, depth through lighting) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/95 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

      {/* Top Row: Floating User Badge + Media Type Icon (No "Playing Now" tag) */}
      <div className="relative z-10 flex items-center justify-between">
        <Link
          to="/u/$username"
          params={{ username: item.user.username }}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xl transition-all shadow-md"
        >
          <DkAvatar src={item.user.avatarUrl} name={item.user.username} size="xs" className="!h-5 !w-5" />
          <span className="text-xs font-bold text-white truncate max-w-[120px]">{item.user.username}</span>
        </Link>

        {/* Media Type Indicator Pip */}
        <div className="w-7 h-7 rounded-full bg-black/45 backdrop-blur-xl flex items-center justify-center shadow-md">
          <MediaIcon type={item.mediaType} />
        </div>
      </div>

      {/* Center: Unobstructed Art Space */}
      <div className="flex-1 pointer-events-none" />

      {/* Bottom: Media Title + Live Session Metrics */}
      <div className="relative z-10 flex flex-col gap-2">
        {item.mediaId ? (
          <Link
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: targetMediaType, mediaId: item.mediaId }}
            className="block group/title"
          >
            {item.subtitle && (
              <span className="text-[9px] font-black uppercase tracking-widest text-primary drop-shadow block mb-0.5 truncate">
                {item.subtitle}
              </span>
            )}
            <h3 className="text-lg font-black text-white leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] group-hover/title:text-primary transition-colors flex items-center gap-1.5">
              <span className="truncate">{item.title}</span>
              <svg
                className="w-4 h-4 text-primary opacity-80 group-hover/title:translate-x-1 transition-transform shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </h3>
          </Link>
        ) : (
          <div className="block">
            {item.subtitle && (
              <span className="text-[9px] font-black uppercase tracking-widest text-primary drop-shadow block mb-0.5 truncate">
                {item.subtitle}
              </span>
            )}
            <h3 className="text-lg font-black text-white leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              <span className="truncate">{item.title}</span>
            </h3>
          </div>
        )}

        {/* Metric Pills Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.elapsedMs != null && item.elapsedMs > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-white/90 bg-white/15 px-2 py-0.5 rounded-lg backdrop-blur-xl shadow-md">
              ⏱ {formatDuration(item.elapsedMs)}
            </span>
          )}

          {fpsRounded !== null && fpsRounded > 0 && (
            <span className="inline-flex items-center gap-1 font-mono font-bold text-[10px] text-emerald-300 bg-emerald-500/25 px-2 py-0.5 rounded-lg backdrop-blur-xl shadow-md">
              {fpsRounded} FPS
            </span>
          )}

          {item.sessionXp != null && item.sessionXp > 0 && (
            <span className="inline-flex items-center gap-0.5 font-mono font-bold text-[10px] text-primary bg-primary/20 px-2 py-0.5 rounded-lg backdrop-blur-xl shadow-md">
              <Zap size={10} className="fill-primary" />
              +{item.sessionXp} XP
            </span>
          )}
        </div>
      </div>
    </div>
  )
};
