import { useQuery } from '@tanstack/react-query'
import { Star, Users } from 'lucide-react'
import { StarInput } from '@/features/review/molecules/star-input'
import { useAuth } from '@/features/auth/auth-provider'
import { Skeleton } from '@ui/atoms/skeleton'
import { userRatingQueries, useRateUser, useDeleteUserRating } from '../user-rating-queries'
import { userQueries } from '../user-queries'
import { cn } from '@/lib/utils'

interface UserRatingSectionProps {
  username: string
}

export function UserRatingSection({ username }: UserRatingSectionProps) {
  const { user: currentUser } = useAuth()

  if (!currentUser) {
    return (
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Star className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Rate this user</p>
            <p className="text-xs text-muted-foreground">
              <a href="/auth/login" className="text-primary hover:underline">Sign in</a> to rate
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <UserRatingContent username={username} currentUsername={currentUser.username} />
}

function UserRatingContent({ username, currentUsername }: { username: string; currentUsername: string }) {
  const isOwnProfile = currentUsername === username

  const myRatingQuery = useQuery(userRatingQueries.myRating(username))
  const reputationQuery = useQuery(userRatingQueries.reputation(username))
  const profileQuery = useQuery(userQueries.profile(username))

  const rateUser = useRateUser(username)
  const deleteRating = useDeleteUserRating(username)

  const profile = profileQuery.data
  const myRating = myRatingQuery.data
  const reputation = reputationQuery.data

  if (isOwnProfile) {
    if (reputationQuery.isLoading) return <RatingCardSkeleton />
    if (!reputation) return null

    return (
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Your Reputation</p>
            <p className="text-xs text-muted-foreground">
              {reputation.userRatingCount > 0
                ? `Rated by ${reputation.userRatingCount} user${reputation.userRatingCount !== 1 ? 's' : ''}`
                : 'Not yet rated by other users'}
            </p>
          </div>
        </div>

        <div className="flex items-end gap-6">
          <div className="text-center">
            <p
              className={cn(
                'text-4xl font-extrabold tabular-nums tracking-tight',
                (reputation.compositeScore ?? 0) >= 7 ? 'text-emerald-400' :
                (reputation.compositeScore ?? 0) >= 4 ? 'text-amber-400' : 'text-muted-foreground',
              )}
            >
              {reputation.compositeScore?.toFixed(1) ?? '—'}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              Score
            </p>
          </div>

          <div className="flex-1 space-y-1.5">
            {reputation.components && Object.entries(reputation.components).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-20 text-[10px] uppercase tracking-wider text-muted-foreground text-right shrink-0">
                  {key}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/40 transition-all duration-500"
                    style={{ width: `${(val / 10) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">
                  {val.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Viewing another user's profile
  if (myRatingQuery.isLoading || !profile) return <RatingCardSkeleton />

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Star className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {myRating ? 'Your Rating' : 'Rate this User'}
          </p>
          <p className="text-xs text-muted-foreground">
            {myRating ? `You rated ${username} ${myRating.score}/10` : 'How would you rate this user?'}
          </p>
        </div>
        {myRating && (
          <button
            onClick={() => deleteRating.mutate()}
            className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <StarInput
        value={myRating?.score ?? null}
        onChange={(score) => rateUser.mutate(score)}
        size="md"
      />

      {profile.compositeScore != null && (
        <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reputation score:</span>
          <span className={cn(
            'text-sm font-bold tabular-nums',
            profile.compositeScore >= 7 ? 'text-emerald-400' :
            profile.compositeScore >= 4 ? 'text-amber-400' : 'text-muted-foreground',
          )}>
            {profile.compositeScore.toFixed(1)}/10
          </span>
        </div>
      )}
    </div>
  )
}

function RatingCardSkeleton() {
  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)] space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded" />
        ))}
      </div>
    </div>
  )
}
