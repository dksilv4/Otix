import { Users, UserPlus } from 'lucide-react'
import { FriendCard } from '../molecules/friend-card'
import type { Friend, ActiveFriend } from '../../types'

interface FriendsListViewProps {
  friends: Friend[]
  activeFriends: ActiveFriend[]
  searchQuery: string
  onManage: (friend: Friend) => void
  onOpenAddFriend: () => void
  isLoading?: boolean
}

export const FriendsListView = ({
  friends,
  activeFriends,
  searchQuery,
  onManage,
  onOpenAddFriend,
  isLoading = false,
}: FriendsListViewProps) => {
  const activeMap = new Map(activeFriends.map((a) => [a.friend.id, a]))

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl animate-pulse shadow-sm"
          />
        ))}
      </div>
    )
  }

  if (friends.length === 0) {
    if (searchQuery.trim().length > 0) {
      return (
        <div className="rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl p-12 text-center shadow-[var(--dk-shadow-glass)]">
          <p className="text-sm font-semibold text-foreground">
            No friends found
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No friends match "{searchQuery}".
          </p>
        </div>
      )
    }

    return (
      <div className="rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-xl p-12 text-center shadow-[var(--dk-shadow-glass)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Users className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-base font-bold text-foreground">
          No friends yet
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
          Otix is better together! Search for your friends to share ratings, check out what they're watching, and see their gaming sessions.
        </p>
        <button
          type="button"
          onClick={onOpenAddFriend}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Find Friends</span>
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {friends.map((friend) => (
        <FriendCard
          key={friend.id}
          friend={friend}
          activeInfo={activeMap.get(friend.id)}
          onManage={onManage}
        />
      ))}
    </div>
  )
};
