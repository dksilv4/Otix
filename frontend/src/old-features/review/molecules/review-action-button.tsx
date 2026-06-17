import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Star } from 'lucide-react'
import { useAuth } from '@/old-features/auth'
import { DkDialog } from '@/old-features/dk-ui/molecules/dialog'
import { cn } from '@/lib/utils'
import { ReviewComposer } from './review-composer'
import { reviewQueries, type ReviewOut } from '../review-queries'
import { ratingQueries, type MediaRatingOut } from '../rating-queries'
import './review-action-button.scss'

interface ReviewActionButtonProps {
  mediaId: string
  mediaType: string
  className?: string
}

export function ReviewActionButton({ mediaId, mediaType, className }: ReviewActionButtonProps) {
  const { isAuthenticated } = useAuth()
  const [composerOpen, setComposerOpen] = useState(false)

  const myReviewQuery = useQuery({
    ...reviewQueries.myReview(mediaType, mediaId),
    enabled: isAuthenticated,
  })
  const myRatingQuery = useQuery({
    ...ratingQueries.myRating(mediaType, mediaId),
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
        className={cn('dk-review-action-button glass-inset', className)}
      >
        {(hasRating || hasReview) && (
          <div className="dk-review-action-button__glow" />
        )}
        <Icon
          className={cn(
            'dk-review-action-button__icon',
            (hasRating || hasReview) ? 'dk-review-action-button__icon--active' : 'dk-review-action-button__icon--muted',
          )}
        />
        <span className="dk-review-action-button__label">
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
          mediaType={mediaType}
          existingReview={review}
          existingRating={rating}
          onClose={() => setComposerOpen(false)}
          onSaved={() => { myReviewQuery.refetch(); myRatingQuery.refetch() }}
        />
      </DkDialog>
    </>
  )
}
