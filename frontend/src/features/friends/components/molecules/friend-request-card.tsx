import { Link } from '@tanstack/react-router'
import { Check, X, Clock } from 'lucide-react'
import { FriendAvatar } from '../atoms/friend-avatar'
import { formatRelativeTime } from '../../utils'
import type { FriendRequest } from '../../types'

interface FriendRequestCardProps {
  request: FriendRequest
  type: 'incoming' | 'outgoing'
  onAccept?: (requestId: number) => void
  onReject?: (requestId: number) => void
  isProcessing?: boolean
}

export const FriendRequestCard = ({
  request,
  type,
  onAccept,
  onReject,
  isProcessing = false,
}: FriendRequestCardProps) => {
  const targetUser = type === 'incoming' ? request.sender : request.receiver
  const relativeTime = formatRelativeTime(request.createdAt)

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--dk-surface-glass)] p-4 transition-all duration-200 border border-[var(--dk-separator)] shadow-sm">
      <Link
        to="/u/$username"
        params={{ username: targetUser.username }}
        className="flex items-center gap-3 min-w-0 flex-1 group"
      >
        <FriendAvatar
          src={targetUser.avatarUrl}
          username={targetUser.username}
          size="md"
        />

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {targetUser.username}
          </h4>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{relativeTime ? `${relativeTime}` : 'Pending'}</span>
          </div>
        </div>
      </Link>

      {type === 'incoming' ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onAccept?.(request.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Accept</span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onReject?.(request.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost-active)] hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Decline</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-ghost)] px-2.5 py-1 text-xs font-medium text-muted-foreground shrink-0">
          <span>Pending request</span>
        </div>
      )}
    </div>
  )
};
