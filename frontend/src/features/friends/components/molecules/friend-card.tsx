import { Link } from '@tanstack/react-router'
import { MoreHorizontal, User } from 'lucide-react'
import { FriendAvatar } from '../atoms/friend-avatar'
import { FriendStatusBadge } from '../atoms/friend-status-badge'
import { formatFriendsSince } from '../../utils'
import type { Friend, ActiveFriend } from '../../types'

interface FriendCardProps {
  friend: Friend
  activeInfo?: ActiveFriend
  onManage: (friend: Friend) => void
}

export const FriendCard = ({ friend, activeInfo, onManage }: FriendCardProps) => {
  const state = activeInfo?.state ?? 'offline'
  const stateLabel = activeInfo?.stateLabel ?? 'Offline'

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl bg-[var(--dk-surface-glass)] p-4 transition-all duration-200 hover:bg-[var(--dk-surface-ghost-hover)] border border-[var(--dk-separator)] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/u/$username"
          params={{ username: friend.username }}
          className="flex items-center gap-3 min-w-0 flex-1 group/user"
        >
          <FriendAvatar
            src={friend.avatarUrl}
            username={friend.username}
            size="md"
            state={state}
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground group-hover/user:text-primary transition-colors">
              {friend.username}
            </h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <FriendStatusBadge state={state} label={stateLabel} />
            </div>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => onManage(friend)}
          className="shrink-0 rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-active)] hover:text-foreground cursor-pointer"
          aria-label={`Manage friendship with ${friend.username}`}
          title="Manage friendship"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {friend.bio && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground/90">
          {friend.bio}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--dk-separator)] pt-3">
        <span className="text-[11px] text-muted-foreground">
          {formatFriendsSince(friend.friendsSince)}
        </span>

        <Link
          to="/u/$username"
          params={{ username: friend.username }}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost)]"
        >
          <User className="h-3 w-3 text-muted-foreground" />
          <span>Profile</span>
        </Link>
      </div>
    </div>
  )
};
