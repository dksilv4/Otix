import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareQuote, Sparkles, Star, Pencil, Plus } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useModal } from '@/lib/modals'
import { useAuth } from '@/lib/providers/auth'
import { ReviewCard } from '../molecules/review-card'
import { RatingCard } from '../molecules/rating-card'
import { ReviewComposer } from '../molecules/review-composer'
import { reviewQueries, type ReviewWithUserOut, type ReviewOut } from '../review-queries'
import { ratingQueries, type MediaRatingWithUserOut, type MediaRatingOut } from '../rating-queries'
import { cn } from '@/lib/utils'
import './reviews-list-section.scss'

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
  const { user, isAuthenticated } = useAuth()
  const { openModal } = useModal()
  const [selectedTab, setSelectedTab] = useState<'reviews' | 'ratings' | null>(null)

  const reviewsQuery = useQuery({
    ...reviewQueries.list(mediaType, mediaId),
    staleTime: 1000 * 30,
  })

  const ratingsQuery = useQuery({
    ...ratingQueries.list(mediaType, mediaId),
    staleTime: 1000 * 30,
  })

  const myReviewQuery = useQuery({
    ...reviewQueries.myReview(mediaType, mediaId),
    enabled: isAuthenticated,
  })

  const myRatingQuery = useQuery({
    ...ratingQueries.myRating(mediaType, mediaId),
    enabled: isAuthenticated,
  })

  const myReview = (myReviewQuery.data ?? null) as ReviewOut | null
  const myRating = (myRatingQuery.data ?? null) as MediaRatingOut | null
  const hasMyReviewOrRating = Boolean(myReview?.content || myRating?.score)

  const handleOpenComposer = () => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title={hasMyReviewOrRating ? 'Edit Your Review & Rating' : 'Rate & Write Review'}
      >
        <ReviewComposer
          mediaType={mediaType}
          mediaId={mediaId}
          existingReview={myReview}
          existingRating={myRating}
          onClose={() => close()}
          onSaved={() => {
            reviewsQuery.refetch()
            ratingsQuery.refetch()
          }}
        />
      </DkDialog>,
    )
  }

  const handleEditReview = (review: ReviewWithUserOut) => {
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
          existingRating={review?.rating ?? myRating}
          onClose={() => close()}
          onSaved={() => {
            reviewsQuery.refetch()
            ratingsQuery.refetch()
          }}
        />
      </DkDialog>,
    )
  }

  const handleDeleteReview = (review: ReviewWithUserOut) => {
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
          existingRating={review?.rating ?? myRating}
          onClose={() => close()}
          onSaved={() => {
            reviewsQuery.refetch()
            ratingsQuery.refetch()
          }}
        />
      </DkDialog>,
    )
  }

  const isLoading = reviewsQuery.isLoading || ratingsQuery.isLoading
  const isError = reviewsQuery.isError && ratingsQuery.isError

  if (isLoading) {
    return (
      <section className={cn('dk-review', className)}>
        <div className="dk-review__header">
          <h2 className="dk-review__heading">Community Reviews &amp; Ratings</h2>
        </div>
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
      <section className={cn('dk-review', className)}>
        <div className="dk-review__header">
          <h2 className="dk-review__heading">Community Reviews &amp; Ratings</h2>
        </div>
        <div className="dk-review__placeholder">
          <p className="dk-review__placeholder-text dk-review__placeholder-text--error">
            Failed to load community feedback.
          </p>
          <DkButton
            variant="outline"
            size="sm"
            onClick={() => {
              reviewsQuery.refetch()
              ratingsQuery.refetch()
            }}
          >
            Retry
          </DkButton>
        </div>
      </section>
    )
  }

  const reviewsData = reviewsQuery.data
  const reviewList: ReviewWithUserOut[] = Array.isArray(reviewsData)
    ? reviewsData
    : Array.isArray((reviewsData as any)?.results)
      ? (reviewsData as any).results
      : Array.isArray((reviewsData as any)?.items)
        ? (reviewsData as any).items
        : []

  const ratingsData = ratingsQuery.data
  const ratingList: MediaRatingWithUserOut[] = Array.isArray(ratingsData)
    ? ratingsData
    : Array.isArray((ratingsData as any)?.results)
      ? (ratingsData as any).results
      : Array.isArray((ratingsData as any)?.items)
        ? (ratingsData as any).items
        : []

  // Ratings from users who only rated (did not leave a written review)
  const ratingsOnlyList = ratingList.filter((r) => !r.hasReview)
  const displayRatings = ratingsOnlyList.length > 0 ? ratingsOnlyList : ratingList

  const hasReviews = reviewList.length > 0
  const hasRatings = displayRatings.length > 0
  const hasAnyFeedback = hasReviews || hasRatings

  // Default to ratings tab if there are no reviews but ratings exist
  const activeTab: 'reviews' | 'ratings' =
    selectedTab ?? (!hasReviews && hasRatings ? 'ratings' : 'reviews')

  // ── State 1: Completely empty (0 reviews and 0 ratings) ──
  if (!hasAnyFeedback) {
    return (
      <section className={cn('dk-review', className)}>
        <div className="dk-review__header">
          <h2 className="dk-review__heading">Community Reviews &amp; Ratings</h2>
        </div>

        <div className="dk-review__empty-state">
          <div className="dk-review__empty-glow" />
          <div className="dk-review__empty-icon-wrap">
            <MessageSquareQuote className="w-6 h-6" />
          </div>
          <h3 className="dk-review__empty-title">No reviews or ratings yet</h3>
          <p className="dk-review__empty-desc">
            Be the first to share your thoughts or score this title to help fellow fans and friends discover it!
          </p>
          {isAuthenticated ? (
            <DkButton variant="primary" size="md" onClick={handleOpenComposer}>
              <Sparkles className="w-4 h-4" />
              Write the First Review
            </DkButton>
          ) : (
            <p className="text-xs text-muted-foreground/80">
              Sign in to rate and share your review.
            </p>
          )}
        </div>
      </section>
    )
  }

  // ── State 2: Has feedback (reviews and/or ratings) ──
  return (
    <section className={cn('dk-review', className)}>
      <div className="dk-review__header">
        <div className="dk-review__header-left">
          <h2 className="dk-review__heading">Community Reviews &amp; Ratings</h2>

          {/* Interactive tabs */}
          <div className="dk-review__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reviews'}
              onClick={() => setSelectedTab('reviews')}
              className={cn(
                'dk-review__tab',
                activeTab === 'reviews' && 'dk-review__tab--active',
              )}
            >
              <MessageSquareQuote className="w-3.5 h-3.5" />
              <span>Reviews</span>
              <span className="dk-review__tab-count">{reviewList.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ratings'}
              onClick={() => setSelectedTab('ratings')}
              className={cn(
                'dk-review__tab',
                activeTab === 'ratings' && 'dk-review__tab--active',
              )}
            >
              <Star className="w-3.5 h-3.5" />
              <span>Ratings</span>
              <span className="dk-review__tab-count">{displayRatings.length}</span>
            </button>
          </div>
        </div>

        {isAuthenticated && (
          <button
            type="button"
            onClick={handleOpenComposer}
            className="dk-review__action-btn"
          >
            {hasMyReviewOrRating ? (
              <>
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Your Review</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Write a Review</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Reviews Tab Content ── */}
      {activeTab === 'reviews' && (
        <>
          {reviewList.length > 0 ? (
            <div className="dk-review__list">
              {reviewList.map((review) => (
                <ReviewCard
                  key={`${review.userId}-${review.createdAt}`}
                  review={review}
                  isOwn={user?.id === review.userId}
                  onEdit={() => handleEditReview(review)}
                  onDelete={() => handleDeleteReview(review)}
                />
              ))}
            </div>
          ) : (
            <div className="dk-review__placeholder">
              <p className="dk-review__placeholder-text mb-3">
                No written reviews yet. Several community members have rated this title — be the first to write a full review!
              </p>
              {isAuthenticated && (
                <DkButton variant="primary" size="sm" onClick={handleOpenComposer}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Write a Review
                </DkButton>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Ratings Tab Content (People who rated) ── */}
      {activeTab === 'ratings' && (
        <>
          {reviewList.length === 0 && (
            <div className="dk-review__banner">
              <div className="dk-review__banner-content">
                <div className="dk-review__banner-icon">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="dk-review__banner-title">No written reviews yet</h4>
                  <p className="dk-review__banner-subtitle">
                    Fans have rated this title. Be the first to share an in-depth review!
                  </p>
                </div>
              </div>
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleOpenComposer}
                  className="dk-review__action-btn shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Write a Review</span>
                </button>
              )}
            </div>
          )}

          {displayRatings.length > 0 ? (
            <div className="dk-review__list">
              {displayRatings.map((rating) => (
                <RatingCard
                  key={`${rating.userId}-${rating.createdAt}`}
                  rating={rating}
                  isOwn={user?.id === rating.userId}
                  onEdit={handleOpenComposer}
                />
              ))}
            </div>
          ) : (
            <div className="dk-review__placeholder">
              <p className="dk-review__placeholder-text">No ratings recorded yet.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export { ReviewsListSection }
