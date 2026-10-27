import { Activity, Film, Star, Bookmark } from 'lucide-react'
import { FriendActivityItem } from '../molecules/friend-activity-item'
import type { FriendActivityEvent, ActivityFilterKey } from '../../types'

interface FriendsActivityFeedProps {
  activities: FriendActivityEvent[]
  filter: ActivityFilterKey
  onFilterChange: (filter: ActivityFilterKey) => void
  isLoading?: boolean
}

export const FriendsActivityFeed = ({
  activities,
  filter,
  onFilterChange,
  isLoading = false,
}: FriendsActivityFeedProps) => {
  return (
    <div className="space-y-4">
      {/* Activity Filter Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onFilterChange('all')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>All</span>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('watched')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            filter === 'watched'
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground'
          }`}
        >
          <Film className="h-3.5 w-3.5" />
          <span>Watched</span>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('reviews')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            filter === 'reviews'
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground'
          }`}
        >
          <Star className="h-3.5 w-3.5" />
          <span>Reviews</span>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('interactions')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            filter === 'interactions'
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground'
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span>Interactions</span>
        </button>
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl animate-pulse shadow-sm"
            />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-xl p-12 text-center shadow-[var(--dk-shadow-glass)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Activity className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-foreground">
            No friend activity yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
            When your friends watch shows, write reviews, or interact with media, their activities will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((act, index) => (
            <FriendActivityItem
              key={`${act.user.id}-${act.timestamp}-${index}`}
              activity={act}
            />
          ))}
        </div>
      )}
    </div>
  )
};
