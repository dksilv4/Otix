import { useQuery } from '@tanstack/react-query'
import { Star, BarChart3 } from 'lucide-react'
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

// Sorted order for stacked segments
const MEDIA_TYPES = ['movie', 'show', 'game', 'music'] as const

export function ProfileRatingDistributionSection({ username }: { username: string }) {
  const distQuery = useQuery(userQueries.ratingDistribution(username))

  if (distQuery.isLoading) return <RatingDistributionSkeleton />
  if (distQuery.isError || !distQuery.data) return null

  const { distribution, totalRatings } = distQuery.data
  if (totalRatings === 0) return null

  // Calculate max total across any score (for bar scaling)
  const maxBarTotal = Math.max(...distribution.map((d) => d.movie + d.show + d.game + d.music), 1)

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Rating Distribution</h2>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-4 sm:p-6 shadow-[var(--dk-shadow-sm)]">
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-5">
          {MEDIA_TYPES.map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: MEDIA_TYPE_COLORS[type] }} />
              {MEDIA_TYPE_LABELS[type]}
            </span>
          ))}
        </div>

        {/* Bars */}
        <div className="flex items-end gap-1.5 sm:gap-2 min-h-[180px]">
          {distribution.map((item) => {
            const total = item.movie + item.show + item.game + item.music
            if (total === 0) {
              return (
                <div key={item.score} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                    <div className="w-full rounded-t-sm bg-white/[0.03] h-full" />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground/40">{item.score}</span>
                </div>
              )
            }
            const pct = (total / maxBarTotal) * 100

            // Ordered segments: movie at bottom, then show, game, music on top
            const segments = MEDIA_TYPES.map((type) => ({
              type,
              count: item[type],
              pctOfBar: item[type] / total,
            }))

            return (
              <div key={item.score} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {/* Percentage label */}
                <span className="text-[9px] font-bold tabular-nums text-muted-foreground/30">
                  {Math.round((total / totalRatings) * 100)}%
                </span>

                {/* Stacked bar */}
                <div
                  className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse relative"
                  style={{ height: `clamp(20px, ${pct}%, 180px)`, minHeight: total > 0 ? '4px' : '0' }}
                >
                  {segments.map((seg) =>
                    seg.count > 0 ? (
                      <div
                        key={seg.type}
                        className="w-full transition-all duration-300 hover:brightness-125"
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
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground/60">{item.score}</span>

                {/* Count below score (tiny) */}
                <span className="text-[8px] tabular-nums text-muted-foreground/30">{total}</span>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center gap-4 text-[11px] text-muted-foreground/50">
          <span className="inline-flex items-center gap-1">
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
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
        <div className="flex items-end gap-2 h-[180px]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
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
