import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, Star } from 'lucide-react'
import { userQueries, type TopRatedItem } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileTopRatedProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
}

export const UserProfileTopRated = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
}: UserProfileTopRatedProps) => {
  const query = useQuery(userQueries.topRated(username))
  const items: TopRatedItem[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data],
  )

  const summary = items.length > 0 ? `${items.length} titles` : undefined

  return (
    <div data-testid="user-profile-top-rated" className="w-full space-y-4">
      <SectionHeader
        icon={Heart}
        title="Top Rated"
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
        {query.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="aspect-[2/3] rounded-xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <Star className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              No top rated items yet
            </p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs mt-0.5">
              High-rated media will be spotlighted here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {items.slice(0, 6).map((item, idx) => (
              <div
                key={item.mediaItem?.id || idx}
                className="group relative flex flex-col rounded-xl overflow-hidden bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] hover:scale-[1.02] transition-all duration-200"
              >
                <div className="relative aspect-[2/3] w-full bg-[var(--dk-surface-ghost)] overflow-hidden">
                  {item.mediaItem?.posterUrl ? (
                    <img
                      src={item.mediaItem.posterUrl}
                      alt={item.mediaItem.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <Heart className="h-8 w-8" />
                    </div>
                  )}

                  {item.review?.score != null && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--dk-surface-base)]/90 backdrop-blur-md text-primary font-bold text-[10px] shadow">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      <span>{item.review.score.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="p-2 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate block">
                    {item.mediaItem?.title || 'Unknown title'}
                  </span>
                  {item.mediaItem?.releaseYear && (
                    <span className="text-[10px] text-muted-foreground">
                      {item.mediaItem.releaseYear}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
