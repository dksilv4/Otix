// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { Star, BarChart3 } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'
import './profile-rating-distribution-section.scss'

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

// Sorted order for stacked segments
const MEDIA_TYPES = ['movie', 'show', 'game', 'music'] as const

export function ProfileRatingDistributionSection({ username }: { username: string }) {
  const distQuery = useQuery(userQueries.ratingDistribution(username))

  if (distQuery.isLoading) return <RatingDistributionSkeleton />
  if (distQuery.isError || !distQuery.data) return null

  const distribution = Array.isArray(distQuery.data?.distribution) ? distQuery.data.distribution : []
  const totalRatings = distQuery.data?.totalRatings ?? 0
  if (totalRatings === 0 || distribution.length === 0) return null

  // Calculate max total across any score (for bar scaling)
  const maxBarTotal = Math.max(
    ...distribution.map((d) => (d.movie || 0) + (d.show || 0) + (d.game || 0) + (d.music || 0)),
    1,
  )

  return (
    <section className="dk-user-rating-distribution">
      <div className="dk-user-rating-distribution__header">
        <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="dk-user-rating-distribution__title">Rating Distribution</h2>
      </div>

      <div className="dk-user-rating-distribution__card">
        {/* Legend */}
        <div className="dk-user-rating-distribution__legend">
          {MEDIA_TYPES.map((type) => (
            <span key={type} className="dk-user-rating-distribution__legend-item">
              <span className="dk-user-rating-distribution__legend-swatch" style={{ backgroundColor: MEDIA_TYPE_COLORS[type] }} />
              {MEDIA_TYPE_LABELS[type]}
            </span>
          ))}
        </div>

        {/* Bars */}
        <div className="dk-user-rating-distribution__bars">
          {distribution.map((item) => {
            const total = (item.movie || 0) + (item.show || 0) + (item.game || 0) + (item.music || 0)
            if (total === 0) {
              return (
                <div key={item.score} className="dk-user-rating-distribution__bar-group">
                  <div className="dk-user-rating-distribution__bar-wrapper--empty" style={{ height: '160px' }}>
                    <div className="dk-user-rating-distribution__bar-empty-fill" />
                  </div>
                  <span className="dk-user-rating-distribution__label-score dk-user-rating-distribution__label-score--empty">{item.score}</span>
                </div>
              )
            }
            const pct = (total / maxBarTotal) * 100

            // Ordered segments: movie at bottom, then show, game, music on top
            const segments = MEDIA_TYPES.map((type) => ({
              type,
              count: item[type] || 0,
              pctOfBar: total > 0 ? (item[type] || 0) / total : 0,
            }))

            return (
              <div key={item.score} className="dk-user-rating-distribution__bar-group">
                {/* Percentage label */}
                <span className="dk-user-rating-distribution__label-pct">
                  {Math.round((total / totalRatings) * 100)}%
                </span>

                {/* Stacked bar */}
                <div
                  className="dk-user-rating-distribution__bar-wrapper"
                  style={{ height: `clamp(20px, ${pct}%, 180px)`, minHeight: total > 0 ? '4px' : '0' }}
                >
                  {segments.map((seg) =>
                    seg.count > 0 ? (
                      <div
                        key={seg.type}
                        className="dk-user-rating-distribution__segment"
                        style={{
                          height: `${seg.pctOfBar * 100}%`,
                          backgroundColor: MEDIA_TYPE_COLORS[seg.type],
                        }}
                        title={`${MEDIA_TYPE_LABELS[seg.type]}: ${seg.count}`}
                      />
                    ) : null
                  )}
                </div>

                {/* Score label */}
                <span className="dk-user-rating-distribution__label-score">{item.score}</span>

                {/* Count below score (tiny) */}
                <span className="dk-user-rating-distribution__label-count">{total}</span>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="dk-user-rating-distribution__summary">
          <span className="dk-user-rating-distribution__summary-item">
            <Star className="h-3 w-3 text-amber-400" />
            {totalRatings} rating{totalRatings !== 1 ? 's' : ''}
          </span>
          {distribution.length > 0 && (() => {
            const weighted = distribution.reduce((sum, d) => {
              const total = d.movie + d.show + d.game + d.music
              return sum + d.score * total
            }, 0)
            return (
              <span className="tabular-nums">
                Avg {(weighted / totalRatings).toFixed(1)} / 10
              </span>
            )
          })()}
        </div>
      </div>
    </section>
  )
}

function RatingDistributionSkeleton() {
  return (
    <section>
      <Skeleton className="h-4 w-36 mb-4" />
      <div className="dk-user-rating-distribution__skeleton-card">
        <div className="dk-user-rating-distribution__skeleton-bars">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="dk-user-rating-distribution__skeleton-group">
              <Skeleton className="w-full flex-1 rounded-t-sm" style={{ height: `${30 + Math.random() * 70}%` }} />
              <Skeleton className="h-3 w-4" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-40 mt-5" />
      </div>
    </section>
  )
}
