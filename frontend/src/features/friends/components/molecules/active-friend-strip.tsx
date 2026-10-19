import { Link } from '@tanstack/react-router'
import { Sparkles, Gamepad2, Film } from 'lucide-react'
import { FriendAvatar } from '../atoms/friend-avatar'
import type { ActiveFriend } from '../../types'

interface ActiveFriendStripProps {
  activeFriends: ActiveFriend[]
}

export const ActiveFriendStrip = ({ activeFriends }: ActiveFriendStripProps) => {
  if (activeFriends.length === 0) return null

  return (
    <div className="relative rounded-2xl bg-[var(--dk-surface-glass)] p-4 border border-[var(--dk-separator)] shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Active Friends</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {activeFriends.length}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
        {activeFriends.map(({ friend, state, stateLabel, latestActivity }) => {
          const media = latestActivity?.mediaItem

          return (
            <Link
              key={friend.id}
              to="/u/$username"
              params={{ username: friend.username }}
              className="group flex min-w-[200px] max-w-[240px] shrink-0 items-center gap-3 rounded-xl bg-[var(--dk-surface-ghost)] p-2.5 transition-all duration-200 hover:bg-[var(--dk-surface-ghost-hover)]"
            >
              <FriendAvatar
                src={friend.avatarUrl}
                username={friend.username}
                size="md"
                state={state}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {friend.username}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {stateLabel}
                </p>

                {media && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-primary/90 font-medium truncate">
                    {media.mediaType === 'game' ? (
                      <Gamepad2 className="h-2.5 w-2.5 shrink-0" />
                    ) : (
                      <Film className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">{media.title}</span>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
};
