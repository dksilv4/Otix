// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Clock, TrendingUp, Calendar } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'
import './profile-library-breakdown-section.scss'

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
  const totalItems = s.totalItems ?? 0
  const hasData = totalItems > 0

  return (
    <section>
      <div className="dk-user-library__header">
        <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="dk-user-library__heading">Library</h2>
      </div>

      <div className="dk-user-library__grid">
        {/* Total items with media type breakdown */}
        <div
          className="dk-user-library__card dk-user-library__card--wide"
        >
          <div className="dk-user-library__card-heading">
            <BarChart3 className="h-3.5 w-3.5" style={{ color: CARD_ACCENTS.items.color }} />
            <p className="dk-user-library__card-label">Items</p>
          </div>
          <p className="dk-user-library__card-value dk-user-library__card-value--3xl">{totalItems.toLocaleString()}</p>

          {/* Bar chart */}
          {hasData && (
            <div className="dk-user-library__bar">
              {Object.entries(MEDIA_TYPE_LABELS).map(([type, label]) => {
                const count = s.byMediaType?.[type] || 0
                if (count === 0) return null
                const pct = (count / totalItems) * 100
                return (
                  <div
                    key={type}
                    className="dk-user-library__bar-segment"
                    style={{ width: `${pct}%`, backgroundColor: MEDIA_TYPE_COLORS[type] }}
                    title={`${label}: ${count}`}
                  />
                )
              })}
            </div>
          )}
          {hasData && (
            <div className="dk-user-library__legend">
              {Object.entries(MEDIA_TYPE_LABELS).map(([type, label]) => {
                const count = s.byMediaType?.[type] || 0
                if (count === 0) return null
                return (
                  <span key={type} className="dk-user-library__legend-item">
                    <span className="dk-user-library__legend-dot" style={{ backgroundColor: MEDIA_TYPE_COLORS[type] }} />
                    {label} {count}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Watch time */}
        <div
          className="dk-user-library__card"
          style={{ borderLeft: `3px solid ${CARD_ACCENTS.time.color}44` }}
        >
          <Clock className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.time.color }} />
          <p className="dk-user-library__card-value">
            {s.totalWatchTimeMinutes > 0
              ? `${Math.round(s.totalWatchTimeMinutes / 60).toLocaleString()}h`
              : '—'}
          </p>
          <p className="dk-user-library__card-subtitle">Watch time</p>
        </div>

        {/* Completion rate */}
        <div
          className="dk-user-library__card"
          style={{ borderLeft: `3px solid ${CARD_ACCENTS.completion.color}44` }}
        >
          <TrendingUp className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.completion.color }} />
          <p className="dk-user-library__card-value">
            {s.completionRate > 0 ? `${Math.round(s.completionRate * 100)}%` : '—'}
          </p>
          <p className="dk-user-library__card-subtitle">Completion rate</p>
        </div>

        {/* Most active */}
        <div className="dk-user-library__grid-span">
          {s.mostActiveDay && (
            <div
              className="dk-user-library__card"
              style={{ borderLeft: `3px solid ${CARD_ACCENTS.active.color}44` }}
            >
              <Calendar className="h-3.5 w-3.5 mb-2" style={{ color: CARD_ACCENTS.active.color }} />
              <p className="dk-user-library__card-value dk-user-library__card-value--lg">
                {s.mostActiveDay}{s.mostActiveHour != null ? ` ${formatHour(s.mostActiveHour)}` : ''}
              </p>
              <p className="dk-user-library__card-subtitle">Most active</p>
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
      <div className="dk-user-library__grid">
        <Skeleton className="col-span-2 h-28 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="col-span-2 h-20 rounded-2xl" />
      </div>
    </section>
  )
}
