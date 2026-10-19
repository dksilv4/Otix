import { Link } from '@tanstack/react-router'
import { Users, Gamepad2, Film, ChevronRight } from 'lucide-react'
import { useFriends } from '@/features/friends/hooks/use-friends'
import { useFriendRequests } from '@/features/friends/hooks/use-friend-requests'
import { FriendAvatar } from '@/features/friends/components/atoms/friend-avatar'
import { ActivityModuleSection } from './activity-module-section'

interface ActivityModuleFriendsProps {
  onClose?: () => void
}

/** Activity panel section showing friends currently active and pending requests. */
export const ActivityModuleFriends = ({ onClose }: ActivityModuleFriendsProps) => {
  const { activeNowFriends, activeCount } = useFriends()
  const { incomingCount } = useFriendRequests()

  if (activeNowFriends.length === 0 && incomingCount === 0) return null

  return (
    <ActivityModuleSection className="relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--dk-separator)]">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold text-foreground">Friends</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
              {activeCount} active
            </span>
          )}
          {incomingCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
              {incomingCount} new
            </span>
          )}
        </div>

        <Link
          to="/friends"
          onClick={onClose}
          className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>All</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Active friends list */}
      <div className="space-y-1.5">
        {activeNowFriends.slice(0, 4).map(({ friend, state, stateLabel, latestActivity }) => (
          <Link
            key={friend.id}
            to="/u/$username"
            params={{ username: friend.username }}
            onClick={onClose}
            className="group flex items-center justify-between gap-2.5 rounded-xl bg-[var(--dk-surface-overlay)]/60 hover:bg-[var(--dk-surface-overlay)] border border-[var(--dk-separator)] p-2 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <FriendAvatar
                src={friend.avatarUrl}
                username={friend.username}
                size="sm"
                state={state}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  {friend.username}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {stateLabel}
                </p>
              </div>
            </div>

            {latestActivity?.mediaItem && (
              <div className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                {latestActivity.mediaItem.mediaType === 'game' ? (
                  <Gamepad2 className="h-3.5 w-3.5" />
                ) : (
                  <Film className="h-3.5 w-3.5" />
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </ActivityModuleSection>
  )
};
