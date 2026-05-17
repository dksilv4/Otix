import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { StarInput } from '@/features/review/molecules/star-input'
import { useAuth } from '@/features/auth/auth-provider'
import { Skeleton } from '@ui/atoms/skeleton'
import { userRatingQueries, useRateUser, useDeleteUserRating } from '../user-rating-queries'
import { userQueries } from '../user-queries'

interface UserRatingSectionProps {
  username: string
}

export function UserRatingSection({ username }: UserRatingSectionProps) {
  const { user: currentUser } = useAuth()

  if (!currentUser) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Star className="h-4 w-4 text-primary" />
        <p className="text-xs text-muted-foreground">
          <a href="/auth/login" className="text-primary hover:underline">Sign in</a> to rate
        </p>
      </div>
    )
  }

  return <UserRatingContent username={username} currentUsername={currentUser.username} />
}

function UserRatingContent({ username, currentUsername }: { username: string; currentUsername: string }) {
  const isOwnProfile = currentUsername === username

  const myRatingQuery = useQuery(userRatingQueries.myRating(username))
  const profileQuery = useQuery(userQueries.profile(username))

  const rateUser = useRateUser(username)
  const deleteRating = useDeleteUserRating(username)

  const profile = profileQuery.data
  const myRating = myRatingQuery.data

  // Own profile — reputation is already in the hero meta line
  if (isOwnProfile) return null

  if (myRatingQuery.isLoading || !profile) return <RatingSectionSkeleton />

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Star className="h-3.5 w-3.5 text-muted-foreground/60" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {myRating ? 'Your Rating' : 'Rate'}
        </h2>
        {myRating && (
          <button
            onClick={() => deleteRating.mutate()}
            className="ml-auto text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <StarInput value={myRating?.score ?? null} onChange={(score) => rateUser.mutate(score)} size="sm" />
    </section>
  )
}

function RatingSectionSkeleton() {
  return (
    <section className="space-y-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-32" />
    </section>
  )
}
