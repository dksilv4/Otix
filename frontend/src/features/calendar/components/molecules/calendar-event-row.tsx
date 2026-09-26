import { memo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { CalendarEvent } from '../../types'

interface CalendarEventRowProps {
  event: CalendarEvent
}

const EVENT_BADGE: Record<string, { label: string; className: string }> = {
  watchlist_release: { label: 'Watchlist', className: 'border-blue-500/20 bg-blue-500/10 text-blue-400' },
  new_episode: { label: 'Episode', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
  sequel: { label: 'Franchise', className: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
  new_season: { label: 'Season', className: 'border-purple-500/20 bg-purple-500/10 text-purple-400' },
}

const RELEASE_KIND_BADGE: Record<string, { label: string; className: string }> = {
  premiere: { label: 'Premiere', className: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300' },
  theatrical_limited: {
    label: 'Limited theatrical',
    className: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  },
  theatrical: { label: 'In theaters', className: 'border-sky-500/25 bg-sky-500/10 text-sky-300' },
  digital: { label: 'Digital', className: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' },
  physical: { label: 'Physical', className: 'border-orange-500/25 bg-orange-500/10 text-orange-300' },
  tv: { label: 'TV', className: 'border-violet-500/25 bg-violet-500/10 text-violet-300' },
  release: { label: 'Release', className: 'border-white/15 bg-white/5 text-white/50' },
  episode: { label: 'Episode airs', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' },
}

export const CalendarEventRow = memo(function CalendarEventRow({ event }: CalendarEventRowProps) {
  const navigate = useNavigate()
  const sourceBadge = EVENT_BADGE[event.eventType] ?? EVENT_BADGE.watchlist_release
  const kindBadge =
    event.releaseKind && event.releaseKind !== 'release'
      ? RELEASE_KIND_BADGE[event.releaseKind]
      : event.mediaType === 'movie'
        ? RELEASE_KIND_BADGE.release
        : null

  return (
    <button
      onClick={() =>
        navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: event.mediaType, mediaId: event.mediaItemId } })
      }
      className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      {event.posterUrl && (
        <img
          src={event.posterUrl}
          alt={event.title}
          className="h-12 w-9 flex-shrink-0 rounded object-cover"
          loading="lazy"
        />
      )}
      {!event.posterUrl && (
        <div className="flex h-12 w-9 flex-shrink-0 items-center justify-center rounded bg-white/5 text-[10px] text-white/20">
          —
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-white">{event.title}</span>
          {kindBadge && (
            <span
              className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${kindBadge.className}`}
            >
              {kindBadge.label}
            </span>
          )}
          <span
            className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${sourceBadge.className}`}
          >
            {sourceBadge.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-white/40">{event.reason}</p>
      </div>
      <span className="flex-shrink-0 text-xs text-white/30">{event.mediaType}</span>
    </button>
  )
})
