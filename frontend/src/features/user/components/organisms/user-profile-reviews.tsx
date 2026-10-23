import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Star, MessageSquare } from 'lucide-react'
import { userQueries, type ReviewWithUser } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileReviewsProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
}

export const UserProfileReviews = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
}: UserProfileReviewsProps) => {
  const reviewsQuery = useQuery(userQueries.reviews(username))
  const reviews: ReviewWithUser[] = useMemo(
    () => (Array.isArray(reviewsQuery.data) ? reviewsQuery.data : []),
    [reviewsQuery.data],
  )

  const summary = reviews.length > 0
    ? `${reviews.length} review${reviews.length !== 1 ? 's' : ''}`
    : undefined

  return (
    <div data-testid="user-profile-reviews" className="w-full space-y-4">
      <SectionHeader
        icon={Star}
        title="Reviews & Ratings"
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
        {reviewsQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <MessageSquare className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              No reviews yet
            </p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs mt-0.5">
              Ratings and written reviews will show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.slice(0, 6).map((review, idx) => (
              <div
                key={review.mediaItemId || idx}
                className="group relative p-4 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] hover:bg-[var(--dk-surface-ghost)] transition-colors duration-200"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-foreground truncate block">
                      {review.title || 'Untitled Review'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {review.score != null && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--dk-surface-ghost)] text-primary font-bold text-xs shrink-0">
                      <Star className="h-3 w-3 fill-current" />
                      <span>{review.score.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {review.content && (
                  <p className="text-xs text-muted-foreground/90 line-clamp-3 leading-relaxed">
                    {review.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
