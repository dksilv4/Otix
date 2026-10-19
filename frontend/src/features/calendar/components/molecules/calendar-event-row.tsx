import { memo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { CalendarEvent } from '../../types'

interface CalendarEventRowProps {
  event: CalendarEvent
}

const EVENT_BADGE: Record<string, { label: string; className: string }> = {
  watchlist_release: { label: 'Watchlist', className: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  new_episode: { label: 'Episode', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  sequel: { label: 'Franchise', className: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  new_season: { label: 'Season', className: 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400' },
}

const RELEASE_KIND_BADGE: Record<string, { label: string; className: string }> = {
  premiere: { label: 'Premiere', className: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300' },
  theatrical_limited: {
    label: 'Limited theatrical',
    className: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  },
  theatrical: { label: 'In theaters', className: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  digital: { label: 'Digital', className: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' },
  physical: { label: 'Physical', className: 'border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-300' },
  tv: { label: 'TV', className: 'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  release: { label: 'Release', className: 'border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-muted-foreground' },
  episode: { label: 'Episode airs', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
}

export const CalendarEventRow = memo(({ event }: CalendarEventRowProps) => {
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
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-3 text-left transition-colors hover:bg-[var(--dk-surface-elevated)]"
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
        <div className="flex h-12 w-9 flex-shrink-0 items-center justify-center rounded bg-[var(--dk-surface-ghost)] text-[10px] text-muted-foreground/40">
          —
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{event.title}</span>
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
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.reason}</p>
      </div>
      <span className="flex-shrink-0 text-xs text-muted-foreground/60">{event.mediaType}</span>
    </button>
  )
})
