import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Star } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { DkDialog } from '@/features/dk-ui/molecules/dialog'
import { cn } from '@/lib/utils'
import { ReviewComposer } from './review-composer'
import { reviewQueries, type ReviewOut } from '../review-queries'
import { ratingQueries, type MediaRatingOut } from '../rating-queries'

interface ReviewActionButtonProps {
  mediaId: string
  className?: string
}

export function ReviewActionButton({ mediaId, className }: ReviewActionButtonProps) {
  const { isAuthenticated } = useAuth()
  const [composerOpen, setComposerOpen] = useState(false)

  const myReviewQuery = useQuery({
    ...reviewQueries.myReview(mediaId),
    enabled: isAuthenticated,
  })
  const myRatingQuery = useQuery({
    ...ratingQueries.myRating(mediaId),
    enabled: isAuthenticated,
  })

  if (!isAuthenticated) return null

  const review = (myReviewQuery.data ?? null) as ReviewOut | null
  const rating = (myRatingQuery.data ?? null) as MediaRatingOut | null
  const hasRating = !!rating
  const hasReview = !!(review?.title || review?.content)
  const Icon = hasRating || hasReview ? Pencil : Star

  return (
    <>
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className={cn(
          'group relative flex h-16 w-20 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-[var(--dk-surface-base)] px-3 py-3 transition-all duration-150',
          'hover:bg-[var(--dk-surface-glass)]',
          className,
        )}
      >
        {(hasRating || hasReview) && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--tw-gradient-from),transparent_70%)] from-amber-500/15 opacity-30" />
        )}
        <Icon
          className={cn(
            'relative h-5 w-5 transition-colors',
            (hasRating || hasReview) ? 'fill-current text-amber-400' : 'text-muted-foreground',
          )}
        />
        <span className="relative text-[11px] font-medium text-muted-foreground">
          {hasRating || hasReview ? 'Review' : 'Rate'}
        </span>
      </button>

      <DkDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title={(hasRating || hasReview) ? 'Edit Your Rating' : 'Rate & Review'}
      >
        <ReviewComposer
          mediaId={mediaId}
          existingReview={review}
          existingRating={rating}
          onClose={() => setComposerOpen(false)}
          onSaved={() => { myReviewQuery.refetch(); myRatingQuery.refetch() }}
        />
      </DkDialog>
    </>
  )
}
