import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { User, UserMinus, AlertTriangle } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { FriendAvatar } from '../atoms/friend-avatar'
import { formatFriendsSince } from '../../utils'
import { useRemoveFriend } from '../../queries'
import type { Friend } from '../../types'

interface ManageFriendModalProps {
  friend: Friend | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ManageFriendModal = ({
  friend,
  open,
  onOpenChange,
}: ManageFriendModalProps) => {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const removeMutation = useRemoveFriend()

  if (!friend) return null

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmingRemove(false)
    }
    onOpenChange(nextOpen)
  }

  const handleRemove = () => {
    removeMutation.mutate(friend.id, {
      onSuccess: () => {
        handleClose(false)
      },
    })
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={handleClose}
      title="Friendship Details"
      description={`Manage your connection with @${friend.username}`}
      className="max-w-md"
    >
      <div className="mt-4 space-y-5">
        {/* User Card */}
        <div className="flex items-center gap-4 rounded-2xl bg-[var(--dk-surface-ghost)] p-4">
          <FriendAvatar
            src={friend.avatarUrl}
            username={friend.username}
            size="lg"
          />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-foreground">
              {friend.username}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatFriendsSince(friend.friendsSince)}
            </p>
          </div>
        </div>

        {friend.bio && (
          <div className="rounded-xl bg-[var(--dk-surface-ghost)] p-3 text-xs text-muted-foreground leading-relaxed">
            {friend.bio}
          </div>
        )}

        {/* Action: View full profile */}
        <Link
          to="/u/$username"
          params={{ username: friend.username }}
          onClick={() => handleClose(false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--dk-surface-ghost)] py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          <span>View Full Profile</span>
        </Link>

        {/* Danger zone / Remove friend */}
        <div className="border-t border-[var(--dk-separator)] pt-4">
          {confirmingRemove ? (
            <div className="space-y-3 rounded-2xl bg-destructive/10 p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive-foreground font-medium leading-relaxed">
                  Remove <span className="font-bold">@{friend.username}</span> from your friends? You will no longer see each other's live activity.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-xl bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={removeMutation.isPending}
                  onClick={handleRemove}
                  className="rounded-xl bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {removeMutation.isPending ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
            >
              <UserMinus className="h-4 w-4" />
              <span>Remove Friend</span>
            </button>
          )}
        </div>
      </div>
    </DkDialog>
  )
};
