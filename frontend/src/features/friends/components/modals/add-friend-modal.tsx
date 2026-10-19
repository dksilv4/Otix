import { useState, useTransition } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserPlus, Check, Clock, UserCheck } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkAvatar } from '@ui/atoms/avatar'
import { friendsQueries, useSendFriendRequest } from '../../queries'
import { useFriends } from '../../hooks/use-friends'
import { useFriendRequests } from '../../hooks/use-friend-requests'
import { useAuth } from '@/lib/providers/auth'

interface AddFriendModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const AddFriendModal = ({ open, onOpenChange }: AddFriendModalProps) => {
  const [query, setQuery] = useState('')
  const [, startTransition] = useTransition()
  const { user: currentUser } = useAuth()
  const { friends } = useFriends()
  const { outgoing, incoming, acceptRequest } = useFriendRequests()
  const sendRequestMutation = useSendFriendRequest()

  const searchResultsQuery = useQuery(friendsQueries.searchUsers(query))
  const searchResults = searchResultsQuery.data ?? []

  const friendIds = new Set((friends ?? []).map((f) => f.id))
  const outgoingReceiverIds = new Set((outgoing ?? []).map((r) => r.receiverId))
  const incomingBySenderId = new Map((incoming ?? []).map((r) => [r.senderId, r]))

  const handleSearchChange = (val: string) => {
    startTransition(() => {
      setQuery(val)
    })
  }

  const handleSend = (targetUserId: number) => {
    sendRequestMutation.mutate(targetUserId)
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Friend"
      description="Search Otix users by username to send a friend request"
      className="max-w-md"
    >
      <div className="mt-2 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Type a username..."
            className="w-full rounded-xl bg-[var(--dk-surface-field)] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-1 focus:ring-primary border-none"
            autoFocus
          />
        </div>

        {/* Results container */}
        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-none">
          {query.trim().length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Type at least one character to search for people on Otix.
            </div>
          ) : searchResultsQuery.isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Searching users...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No users found matching "{query}".
            </div>
          ) : (
            searchResults.map((user: any) => {
              const isSelf = user.username === currentUser?.username || user.id === currentUser?.id
              const isFriend = friendIds.has(user.id)
              const hasSentRequest = outgoingReceiverIds.has(user.id)
              const incomingReq = incomingBySenderId.get(user.id)

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--dk-surface-ghost)] p-3 transition-colors hover:bg-[var(--dk-surface-ghost-hover)]"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <DkAvatar
                      src={user.avatarUrl}
                      name={user.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {user.username}
                      </p>
                      {user.levelTitle && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {user.levelTitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Action Button */}
                  {isSelf ? (
                    <span className="text-[11px] font-medium text-muted-foreground px-2 py-1">
                      You
                    </span>
                  ) : isFriend ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-surface-glass)] px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <UserCheck className="h-3 w-3" />
                      <span>Friends</span>
                    </span>
                  ) : hasSentRequest ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--dk-surface-glass)] px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Sent</span>
                    </span>
                  ) : incomingReq ? (
                    <button
                      type="button"
                      onClick={() => acceptRequest(incomingReq.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      <span>Accept</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={sendRequestMutation.isPending}
                      onClick={() => handleSend(user.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      <UserPlus className="h-3 w-3" />
                      <span>Add</span>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </DkDialog>
  )
};
