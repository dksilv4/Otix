import { useState } from 'react'
import { Inbox, Send } from 'lucide-react'
import { FriendRequestCard } from '../molecules/friend-request-card'
import type { FriendRequest } from '../../types'

interface FriendRequestsViewProps {
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
  onAccept: (requestId: number) => void
  onReject: (requestId: number) => void
  isProcessing?: boolean
  isLoading?: boolean
}

export const FriendRequestsView = ({
  incoming,
  outgoing,
  onAccept,
  onReject,
  isProcessing = false,
  isLoading = false,
}: FriendRequestsViewProps) => {
  const [subTab, setSubTab] = useState<'incoming' | 'outgoing'>('incoming')

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Received vs Sent */}
      <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--dk-surface-glass)] p-1.5 border border-[var(--dk-separator)] w-fit">
        <button
          type="button"
          onClick={() => setSubTab('incoming')}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'incoming'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          <span>Received</span>
          {incoming.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
              {incoming.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('outgoing')}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'outgoing'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          <span>Sent</span>
          {outgoing.length > 0 && (
            <span className="rounded-full bg-[var(--dk-surface-ghost-active)] px-1.5 py-0.2 text-[10px] font-bold">
              {outgoing.length}
            </span>
          )}
        </button>
      </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-[var(--dk-surface-glass)] animate-pulse border border-[var(--dk-separator)]"
            />
          ))}
        </div>
      ) : subTab === 'incoming' ? (
        incoming.length === 0 ? (
          <div className="rounded-3xl bg-[var(--dk-surface-glass)] p-12 text-center border border-[var(--dk-separator)] shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Inbox className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base font-bold text-foreground">
              No pending received requests
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              When people send you a friend request, you'll be able to accept or decline it here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map((req) => (
              <FriendRequestCard
                key={req.id}
                request={req}
                type="incoming"
                onAccept={onAccept}
                onReject={onReject}
                isProcessing={isProcessing}
              />
            ))}
          </div>
        )
      ) : outgoing.length === 0 ? (
        <div className="rounded-3xl bg-[var(--dk-surface-glass)] p-12 text-center border border-[var(--dk-separator)] shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Send className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">
            No outgoing requests
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Friend requests you've sent that are awaiting a response will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {outgoing.map((req) => (
            <FriendRequestCard
              key={req.id}
              request={req}
              type="outgoing"
            />
          ))}
        </div>
      )}
    </div>
  )
};
