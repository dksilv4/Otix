// TODO: Review this file
import { useQuery } from "@tanstack/react-query"
import { DkButton } from "@/old-features/ui/atoms/button"
import { DkDialog } from "@/old-features/ui/molecules/dialog"
import { useModal } from "@/lib/modals"
import { useAuth } from "@/features/auth"
import { ReviewCard } from "../molecules/review-card"
import { ReviewComposer } from "../molecules/review-composer"
import { reviewQueries } from "../review-queries"
import { cn } from "@/lib/utils"
import type { ReviewWithUserOut, ReviewOut } from "../review-queries"
import "./reviews-list-section.scss"

interface ReviewsListSectionProps {
 mediaType: string
 mediaId: string
 className?: string
}

function ReviewCardSkeleton() {
 return (
 <div className="dk-review__skeleton">
 <div className="dk-review__skeleton-row">
 <div className="dk-review__skeleton-avatar" />
 <div className="dk-review__skeleton-meta">
 <div className="dk-review__skeleton-line dk-review__skeleton-line--name" />
 <div className="dk-review__skeleton-line dk-review__skeleton-line--date" />
 </div>
 </div>
 <div className="dk-review__skeleton-line dk-review__skeleton-line--full" />
 <div className="dk-review__skeleton-line dk-review__skeleton-line--short" />
 </div>
 )
}

function ReviewsListSection({ mediaType, mediaId, className }: ReviewsListSectionProps) {
  const { user } = useAuth()
  const { openModal } = useModal()

  const { data: reviews, isLoading, isError, refetch } = useQuery({
    ...reviewQueries.list(mediaType, mediaId),
    staleTime: 1000 * 30,
  })

  const handleEdit = (review: ReviewWithUserOut) => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title="Edit Your Review"
      >
        <ReviewComposer
          mediaType={mediaType}
          mediaId={mediaId}
          existingReview={review as ReviewOut}
          existingRating={review?.rating ?? null}
          onClose={() => close()}
        />
      </DkDialog>
    )
  }

  const handleDelete = (review: ReviewWithUserOut) => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title="Edit Your Review"
      >
        <ReviewComposer
          mediaType={mediaType}
          mediaId={mediaId}
          existingReview={review as ReviewOut}
          existingRating={review?.rating ?? null}
          onClose={() => close()}
        />
      </DkDialog>
    )
  }

 if (isLoading) {
 return (
 <section className={cn("dk-review", className)}>
 <h2 className="dk-review__heading">Reviews</h2>
 <div className="dk-review__list">
 {[0, 1, 2].map((i) => (
 <ReviewCardSkeleton key={i} />
 ))}
 </div>
 </section>
 )
 }

 if (isError) {
 return (
 <section className={cn("dk-review", className)}>
 <h2 className="dk-review__heading">Reviews</h2>
 <div className="dk-review__placeholder">
 <p className="dk-review__placeholder-text dk-review__placeholder-text--error">Failed to load reviews.</p>
 <DkButton variant="outline" size="sm" onClick={() => refetch()}>
 Retry
 </DkButton>
 </div>
 </section>
 )
 }

  const reviewList = Array.isArray(reviews)
    ? reviews
    : Array.isArray((reviews as any)?.results)
      ? (reviews as any).results
      : Array.isArray((reviews as any)?.items)
        ? (reviews as any).items
        : []

 return (
 <section className={cn("dk-review", className)}>
 <h2 className="dk-review__heading">
 Reviews
 {reviewList.length > 0 && (
 <span className="dk-review__count">
 ({reviewList.length})
 </span>
 )}
 </h2>

 {reviewList.length === 0 ? (
 <div className="dk-review__placeholder">
 <p className="dk-review__placeholder-text">
 No reviews yet. Be the first to share your thoughts!
 </p>
 </div>
 ) : (
 <div className="dk-review__list">
 {reviewList.map((review) => (
 <ReviewCard
 key={`${review.userId}-${review.createdAt}`}
 review={review}
 isOwn={user?.id === review.userId}
 onEdit={() => handleEdit(review)}
 onDelete={() => handleDelete(review)}
 />
 ))}
 </div>
 )}
 </section>
 )
}

export { ReviewsListSection }
