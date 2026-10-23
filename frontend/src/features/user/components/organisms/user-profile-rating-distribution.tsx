import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Star } from 'lucide-react'
import { userQueries } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileRatingDistributionProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
}

export const UserProfileRatingDistribution = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
}: UserProfileRatingDistributionProps) => {
  const query = useQuery(userQueries.ratingDistribution(username))
  const data = query.data

  const distribution = useMemo(() => {
    return Array.isArray(data?.distribution) ? data.distribution : []
  }, [data?.distribution])

  const maxCount = useMemo(() => {
    return Math.max(1, ...distribution.map((d) => (d.movie || 0) + (d.show || 0) + (d.game || 0) + (d.music || 0)))
  }, [distribution])

  const total = data?.totalRatings ?? 0
  const summary = total > 0 ? `${total} rating${total !== 1 ? 's' : ''}` : undefined

  return (
    <div data-testid="user-profile-rating-distribution" className="w-full space-y-4">
      <SectionHeader
        icon={BarChart2}
        title="Rating Distribution"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
        onRemove={onRemove}
        isRemoving={isRemoving}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)]">
          {total === 0 ? (
            <div className="py-6 flex flex-col items-center justify-center text-center">
              <Star className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
              <p className="text-xs font-semibold text-muted-foreground">
                No ratings logged yet
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-1.5 sm:gap-2 h-36 pt-4">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
                const entry = distribution.find((d) => d.score === score)
                const count = (entry?.movie || 0) + (entry?.show || 0) + (entry?.game || 0) + (entry?.music || 0)
                const heightPct = Math.max(6, Math.round((count / maxCount) * 100))

                return (
                  <div
                    key={score}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                  >
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                      {count}
                    </span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-md bg-primary/20 group-hover:bg-primary transition-all duration-200"
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {score}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
