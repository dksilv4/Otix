// TODO: Review this file
import './user-rating-section.scss'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { StarInput } from '@/features/review/molecules/star-input'
import { useAuth } from '@/lib/providers/auth'
import { userQueries } from '../../user-queries'
import {
  userRatingQueries,
  useRateUser,
  useAnimatedScore,
} from '../../hooks/use-rate-user'

interface UserRatingSectionProps {
  username: string
}

export const UserRatingSection = ({ username }: UserRatingSectionProps) => {
  const { user: currentUser } = useAuth()
  const location = useLocation()

  if (!currentUser) {
    return (
      <span className="dk-user-rating-section__sign-in">
        <Star className="h-3.5 w-3.5 text-primary" />
        <Link to="/auth/login" search={{ redirect: location.href }} className="dk-user-rating-section__link">Sign in</Link> to rate
      </span>
    )
  }

  return <UserRatingContent username={username} currentUsername={currentUser.username} />
};

const UserRatingContent = ({ username, currentUsername }: { username: string; currentUsername: string }) => {
  const isOwnProfile = currentUsername === username

  const myRatingQuery = useQuery(userRatingQueries.myRating(username))
  const profileQuery = useQuery(userQueries.profile(username))

  const rateUser = useRateUser(username)

  const profile = profileQuery.data
  const myRating = myRatingQuery.data
  const loading = myRatingQuery.isLoading || profileQuery.isLoading

  const ownAvgRating = profile?.avgUserRating != null ? Math.round(profile.avgUserRating) : 0
  const otherScore = loading ? 0 : (myRating?.score ?? 0)

  const target = isOwnProfile ? ownAvgRating : otherScore
  const displayScore = useAnimatedScore(target)

  // Own profile — readonly, show average rating from others
  if (isOwnProfile) {
    return <StarInput value={displayScore} onChange={() => {}} size="sm" disabled />
  }

  // Other user's profile — interactive
  return (
    <StarInput
      value={displayScore}
      onChange={(s) => rateUser.mutate(s)}
      size="sm"
      disabled={loading || rateUser.isPending}
    />
  )
};
