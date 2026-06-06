// TODO: Review this file
import { UserPlus, UserCheck } from 'lucide-react'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { useAuth } from '@/features/auth/auth-provider'
import { useFollowUser, useUnfollowUser } from '../user-queries'
import './follow-button.scss'

interface FollowButtonProps {
  username: string
  isFollowing: boolean
}

export function FollowButton({ username, isFollowing }: FollowButtonProps) {
  const { user: currentUser } = useAuth()
  const follow = useFollowUser(username)
  const unfollow = useUnfollowUser(username)

  if (!currentUser || currentUser.username === username) return null

  if (isFollowing) {
    return (
      <DkButton
        variant="secondary"
        size="xs"
        className="dk-user-follow-button"
        onClick={() => unfollow.mutate()}
        loading={unfollow.isPending}
      >
        <UserCheck className="h-3.5 w-3.5" />
        Following
      </DkButton>
    )
  }

  return (
    <DkButton
      variant="glass"
      size="xs"
      className="dk-user-follow-button"
      onClick={() => follow.mutate()}
      loading={follow.isPending}
    >
      <UserPlus className="h-3.5 w-3.5" />
      Follow
    </DkButton>
  )
}
