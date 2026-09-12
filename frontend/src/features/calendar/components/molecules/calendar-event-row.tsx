import { memo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { CalendarEvent } from '../../types'

interface CalendarEventRowProps {
  event: CalendarEvent
}

const BADGE_STYLES: Record<string, { label: string; className: string }> = {
  watchlist_release: { label: 'Watchlist', className: 'border-blue-500/20 bg-blue-500/10 text-blue-400' },
  new_episode: { label: 'Episode', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
  sequel: { label: 'Franchise', className: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
  new_season: { label: 'Season', className: 'border-purple-500/20 bg-purple-500/10 text-purple-400' },
}

export const CalendarEventRow = memo(function CalendarEventRow({ event }: CalendarEventRowProps) {
  const navigate = useNavigate()
  const badge = BADGE_STYLES[event.eventType] ?? BADGE_STYLES.watchlist_release

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
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{event.title}</span>
          <span className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-white/40">{event.reason}</p>
      </div>
      <span className="flex-shrink-0 text-xs text-white/30">{event.mediaType}</span>
    </button>
  )
})
