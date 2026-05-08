import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { DkButton } from "@/features/dk-ui/atoms/button"
import { DkDialog } from "@/features/dk-ui/molecules/dialog"
import { useAuth } from "@/features/auth"
import { ReviewCard } from "../molecules/review-card"
import { ReviewComposer } from "../molecules/review-composer"
import { reviewQueries } from "../review-queries"
import { cn } from "@/lib/utils"
import type { ReviewWithUserOut } from "../review-queries"

interface ReviewsListSectionProps {
  mediaId: string
  className?: string
}

function ReviewCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full animate-pulse bg-[var(--dk-surface-glass)]" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded-full animate-pulse bg-[var(--dk-surface-glass)]" />
          <div className="h-3 w-16 rounded-full animate-pulse bg-[var(--dk-surface-glass)]" />
        </div>
      </div>
      <div className="h-4 w-full rounded-full animate-pulse bg-[var(--dk-surface-glass)]" />
      <div className="h-4 w-2/3 rounded-full animate-pulse bg-[var(--dk-surface-glass)]" />
    </div>
  )
}

function ReviewsListSection({ mediaId, className }: ReviewsListSectionProps) {
  const { user } = useAuth()
  const [editTarget, setEditTarget] = useState<ReviewWithUserOut | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const { data: reviews, isLoading, isError, refetch } = useQuery({
    ...reviewQueries.list(mediaId),
    staleTime: 1000 * 30,
  })

  const handleEdit = (review: ReviewWithUserOut) => {
    setEditTarget(review)
    setComposerOpen(true)
  }

  const handleDelete = (review: ReviewWithUserOut) => {
    setEditTarget(review)
    setComposerOpen(true)
  }

  if (isLoading) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Reviews</h2>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <ReviewCardSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  if (isError) {
    return (
      <section className={cn(className)}>
        <h2 className="text-lg font-semibold mb-3">Reviews</h2>
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">Failed to load reviews.</p>
          <DkButton variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </DkButton>
        </div>
      </section>
    )
  }

  const reviewList = reviews ?? []

  return (
    <section className={cn(className)}>
      <h2 className="text-lg font-semibold mb-3">
        Reviews
        {reviewList.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({reviewList.length})
          </span>
        )}
      </h2>

      {reviewList.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No reviews yet. Be the first to share your thoughts!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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

      <DkDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        title="Edit Your Review"
      >
        <ReviewComposer
          mediaId={mediaId}
          existingReview={editTarget}
          onClose={() => { setComposerOpen(false); setEditTarget(null) }}
        />
      </DkDialog>
    </section>
  )
}

export { ReviewsListSection }
