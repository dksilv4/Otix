import { useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { userQueries } from '../user-queries'
import { ReviewCard } from '@/features/review/molecules/review-card'
import { Skeleton } from '@ui/atoms/skeleton'

export function ReviewsSection({ username }: { username: string }) {
  const reviewsQuery = useQuery(userQueries.reviews(username))

  if (reviewsQuery.isLoading) return <ReviewsSkeleton />
  if (reviewsQuery.isError) return null

  const reviews = reviewsQuery.data ?? []
  if (reviews.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquareText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reviews</h2>
        <span className="text-xs text-muted-foreground/50">{reviews.length}</span>
      </div>
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewCard key={`${review.userId}-${review.mediaItemId}`} review={review} />
        ))}
      </div>
    </section>
  )
}

function ReviewsSkeleton() {
  return (
    <section className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </section>
  )
}
