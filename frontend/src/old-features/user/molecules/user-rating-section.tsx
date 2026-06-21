// TODO: Review this file
import './user-rating-section.scss'
import { useEffect, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { StarInput } from '@/old-features/review/molecules/star-input'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/providers/auth'
import { userQueries } from '../user-queries'

interface UserRatingOut {
  raterId: string
  ratedUserId: string
  score: number
  createdAt: string
  updatedAt: string
}

interface UserReputationOut {
  avgUserRating: number | null
  userRatingCount: number
  compositeScore: number | null
  components: { contribution: number; trust: number; tenure: number }
}

const userRatingKeys = {
  myRating: (username: string) => ['user-rating', 'my', username] as const,
  reputation: (username: string) => ['user', username, 'reputation'] as const,
}

const userRatingQueries = {
  myRating: (username: string) =>
    queryOptions({
      queryKey: userRatingKeys.myRating(username),
      queryFn: async () => {
        const { data } = await apiClient.get<UserRatingOut | null>(`/users/${username}/rating`)
        return data
      },
      staleTime: 1000 * 60,
    }),

  reputation: (username: string) =>
    queryOptions({
      queryKey: userRatingKeys.reputation(username),
      queryFn: async () => {
        const { data } = await apiClient.get<UserReputationOut>(`/users/${username}/reputation`)
        return data
      },
      staleTime: 1000 * 60 * 5,
    }),
}

function useRateUser(username: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (score: number) => {
      const { data } = await apiClient.put<UserRatingOut>(`/users/${username}/rating`, { score })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userRatingKeys.myRating(username) })
      qc.invalidateQueries({ queryKey: ['user', username] })
      qc.invalidateQueries({ queryKey: userRatingKeys.reputation(username) })
    },
  })
}

interface UserRatingSectionProps {
  username: string
}

export function UserRatingSection({ username }: UserRatingSectionProps) {
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
