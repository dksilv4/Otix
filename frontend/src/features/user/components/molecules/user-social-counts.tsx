import { useModal } from '@/lib/modals'
import { cn } from '@/lib/utils'
import { UserSocialListModal } from './user-social-list-modal'
import type { SocialListKind } from '../../user-queries'

interface UserSocialCountsProps {
  username: string
  friendCount: number
  followerCount: number
  followingCount: number
  className?: string
}

function CountButton({
  count,
  label,
  onClick,
}: {
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-baseline gap-1 rounded-md px-0.5 text-xs text-white/40 transition-colors hover:text-white/80 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
    >
      <span className="font-semibold tabular-nums text-white/70">{count}</span>
      <span>{label}</span>
    </button>
  )
}

export function UserSocialCounts({
  username,
  friendCount,
  followerCount,
  followingCount,
  className,
}: UserSocialCountsProps) {
  const { openModal } = useModal()

  const openList = (kind: SocialListKind) => {
    const close = openModal(
      <UserSocialListModal
        username={username}
        kind={kind}
        onClose={() => close()}
      />,
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-white/30',
        className,
      )}
    >
      <CountButton
        count={friendCount}
        label={friendCount === 1 ? 'friend' : 'friends'}
        onClick={() => openList('friends')}
      />
      <span aria-hidden className="text-white/15">·</span>
      <CountButton
        count={followerCount}
        label={followerCount === 1 ? 'follower' : 'followers'}
        onClick={() => openList('followers')}
      />
      <span aria-hidden className="text-white/15">·</span>
      <CountButton
        count={followingCount}
        label="following"
        onClick={() => openList('following')}
      />
    </div>
  )
}
