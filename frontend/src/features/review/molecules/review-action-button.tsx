import { useQuery } from '@tanstack/react-query'
import { Pencil, Star } from 'lucide-react'
import { useAuth } from '@auth/hooks/use-auth'
import { DkDialog } from '@ui/molecules/dialog'
import { useModal } from '@/lib/modals'
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

export function ReviewActionButton({ mediaType, mediaId, className }: ReviewActionButtonProps) {
  const { isAuthenticated } = useAuth()
  const { openModal } = useModal()

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

  const handleOpenComposer = () => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title={(hasRating || hasReview) ? 'Edit Your Rating' : 'Rate & Review'}
      >
        <ReviewComposer
          mediaId={mediaId}
          mediaType={mediaType}
          existingReview={review}
          existingRating={rating}
          onClose={() => close()}
          onSaved={() => { myReviewQuery.refetch(); myRatingQuery.refetch() }}
        />
      </DkDialog>
    )
  }

  return (
    <button
      type="button"
      onClick={handleOpenComposer}
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
  )
}
