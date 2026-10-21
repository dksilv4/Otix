import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Activity, MessageSquare, PlayCircle } from 'lucide-react'
import { userQueries, type ActivityEvent } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileActivityProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
}

export const UserProfileActivity = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
}: UserProfileActivityProps) => {
  const query = useQuery(userQueries.activity(username))
  const events: ActivityEvent[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data],
  )

  const summary = events.length > 0 ? `${events.length} events` : undefined

  return (
    <div data-testid="user-profile-activity" className="w-full space-y-4">
      <SectionHeader
        icon={Clock}
        title="Recent Activity"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        {query.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <Activity className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              No recent activity
            </p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs mt-0.5">
              Actions taken across Otix will be displayed in this feed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 5).map((event, idx) => {
              const isReview = event.type === 'review'
              const Icon = isReview ? MessageSquare : PlayCircle

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[var(--dk-surface-ghost)] text-primary shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground block truncate">
                        {event.summary || (isReview ? 'Wrote a review' : 'Interacted with media')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>

                  {event.score != null && (
                    <span className="text-xs font-bold text-primary tabular-nums shrink-0 ml-3">
                      {event.score}★
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
