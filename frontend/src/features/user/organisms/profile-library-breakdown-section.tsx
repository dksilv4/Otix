import { useQuery } from '@tanstack/react-query'
import { BarChart3, Clock, TrendingUp, Calendar } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'

const MEDIA_TYPE_COLORS: Record<string, string> = {
  movie: '#ef4444',
  show: '#3b82f6',
  game: '#a855f7',
  music: '#eab308',
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show: 'Shows',
  game: 'Games',
  music: 'Music',
}

const CARD_ACCENTS = {
  items: { color: '#3b82f6', icon: BarChart3 },
  time: { color: '#f59e0b', icon: Clock },
  completion: { color: '#34d399', icon: TrendingUp },
  active: { color: '#a78bfa', icon: Calendar },
} as const

export function LibraryBreakdownSection({ username }: { username: string }) {
  const statsQuery = useQuery(userQueries.libraryStats(username))

  if (statsQuery.isLoading) return <LibraryBreakdownSkeleton />
  if (statsQuery.isError || !statsQuery.data) return null

  const s = statsQuery.data
  const hasData = s.totalItems > 0

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Library</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Total items with media type breakdown */}
        <div
          className="col-span-2 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-3.5 w-3.5" style={{ color: CARD_ACCENTS.items.color }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Items</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">{s.totalItems.toLocaleString()}</p>

          {/* Bar chart */}
          {hasData && (
            <div className="mt-3 flex gap-1 h-3 rounded-full overflow-hidden">
              {Object.entries(MEDIA_TYPE_LABELS).map(([type, label]) => {
                const count = s.byMediaType[type] || 0
                if (count === 0) return null
                const pct = (count / s.totalItems) * 100
                return (
                  <div
                    key={type}
                    className="h-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: MEDIA_TYPE_COLORS[type] }}
                    title={`${label}: ${count}`}
                  />
                )
              })}
            </div>
          )}
          {hasData && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(MEDIA_TYPE_LABELS).map(([type, label]) => {
                const count = s.byMediaType[type] || 0
                if (count === 0) return null
                return (
                  <span key={type} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MEDIA_TYPE_COLORS[type] }} />
                    {label} {count}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Watch time */}
        <div
          className="rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
          style={{ borderLeft: `3px solid ${CARD_ACCENTS.time.color}44` }}
        >
          <Clock className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.time.color }} />
          <p className="text-2xl font-bold tabular-nums">
            {s.totalWatchTimeMinutes > 0
              ? `${Math.round(s.totalWatchTimeMinutes / 60).toLocaleString()}h`
              : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">Watch time</p>
        </div>

        {/* Completion rate */}
        <div
          className="rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
          style={{ borderLeft: `3px solid ${CARD_ACCENTS.completion.color}44` }}
        >
          <TrendingUp className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.completion.color }} />
          <p className="text-2xl font-bold tabular-nums">
            {s.completionRate > 0 ? `${Math.round(s.completionRate * 100)}%` : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">Completion rate</p>
        </div>

        {/* Most active */}
        <div className="col-span-2">
          {s.mostActiveDay && (
            <div
              className="rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
              style={{ borderLeft: `3px solid ${CARD_ACCENTS.active.color}44` }}
            >
              <Calendar className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.active.color }} />
              <p className="text-lg font-bold">
                {s.mostActiveDay}{s.mostActiveHour != null ? ` ${formatHour(s.mostActiveHour)}` : ''}
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Most active</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatHour(h: number): string {
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  if (h < 12) return `${h}am`
  return `${h - 12}pm`
}

function LibraryBreakdownSkeleton() {
  return (
    <section>
      <Skeleton className="h-4 w-28 mb-4" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="col-span-2 h-28 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="col-span-2 h-20 rounded-2xl" />
      </div>
    </section>
  )
}
