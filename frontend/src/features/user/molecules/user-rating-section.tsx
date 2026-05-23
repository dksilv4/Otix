import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { StarInput } from '@/features/review/molecules/star-input'
import { useAuth } from '@/features/auth/auth-provider'
import { userRatingQueries, useRateUser } from '../user-rating-queries'
import { userQueries } from '../user-queries'

interface UserRatingSectionProps {
  username: string
}

export function UserRatingSection({ username }: UserRatingSectionProps) {
  const { user: currentUser } = useAuth()

  if (!currentUser) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Star className="h-3.5 w-3.5 text-primary" />
        <a href="/auth/login" className="text-primary hover:underline">Sign in</a> to rate
      </span>
    )
  }

  return <UserRatingContent username={username} currentUsername={currentUser.username} />
}

function useAnimatedScore(target: number) {
  const [anim, setAnim] = useState(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnim(target))
    return () => cancelAnimationFrame(id)
  }, [target])

  return anim
}

function UserRatingContent({ username, currentUsername }: { username: string; currentUsername: string }) {
  const isOwnProfile = currentUsername === username

  const myRatingQuery = useQuery(userRatingQueries.myRating(username))
  const profileQuery = useQuery(userQueries.profile(username))

  const rateUser = useRateUser(username)

  const profile = profileQuery.data
  const myRating = myRatingQuery.data
  const loading = myRatingQuery.isLoading || !profile

  const ownAvgRating = profile?.avgUserRating != null ? Math.round(profile.avgUserRating) : 0
  const otherScore = loading ? 0 : (myRating?.score ?? 0)

  const target = isOwnProfile ? ownAvgRating : otherScore
  const displayScore = useAnimatedScore(target)

  // Own profile — readonly, show average rating from others
  if (isOwnProfile) {
    return <StarInput value={displayScore} onChange={() => {}} size="sm" disabled />
  }

  // Other user's profile — interactive
  return <StarInput value={displayScore} onChange={(s) => rateUser.mutate(s)} size="sm" />
}
