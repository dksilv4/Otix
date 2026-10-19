import { UserPlus, Users, Sparkles, Activity, Inbox, Search } from 'lucide-react'
import type { FriendsTabKey } from '../../types'

interface FriendsOverviewProps {
  currentTab: FriendsTabKey
  onSelectTab: (tab: FriendsTabKey) => void
  onOpenAddFriend: () => void
  totalCount: number
  activeCount: number
  requestsCount: number
  searchQuery: string
  onSearchChange: (query: string) => void
}

export const FriendsOverview = ({
  currentTab,
  onSelectTab,
  onOpenAddFriend,
  totalCount,
  activeCount,
  requestsCount,
  searchQuery,
  onSearchChange,
}: FriendsOverviewProps) => {
  return (
    <div className="space-y-5">
      {/* Top Banner: Title & Primary Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Friends
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {totalCount}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect with friends, see what they're watching, and discover games together.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenAddFriend}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Friend</span>
          </button>
        </div>
      </div>

      {/* Tabs & Search Strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-[var(--dk-surface-glass)] p-1.5 border border-[var(--dk-separator)]">
          <button
            type="button"
            onClick={() => onSelectTab('all')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>All Friends</span>
            <span className="text-[11px] opacity-80">{totalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('active')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'active'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Active</span>
            {activeCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('activity')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'activity'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Activity Feed</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('requests')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'requests'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost)] hover:text-foreground'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Requests</span>
            {requestsCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold">
                {requestsCount}
              </span>
            )}
          </button>
        </div>

        {/* Search input for friends */}
        {currentTab === 'all' && (
          <div className="relative min-w-[200px] sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter friends..."
              className="w-full rounded-xl bg-[var(--dk-surface-field)] py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-1 focus:ring-primary border-none"
            />
          </div>
        )}
      </div>
    </div>
  )
};
