import { useQuery } from '@tanstack/react-query'
import { Clock, MessageSquareText, Heart } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { userQueries, type ActivityEvent } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'

function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActivityIcon({ event }: { event: ActivityEvent }) {
  if (event.type === 'review') {
    return <MessageSquareText className="h-4 w-4 text-primary/60 shrink-0" />
  }
  if (event.interactionType === 'like') {
    return <Heart className="h-4 w-4 text-red-400/60 shrink-0" />
  }
  return <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />
}

export function ActivitySection({ username }: { username: string }) {
  const activityQuery = useQuery(userQueries.activity(username))

  if (activityQuery.isLoading) return <ActivitySkeleton />
  if (activityQuery.isError || !activityQuery.data) return null

  const events = activityQuery.data
  if (events.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
      </div>

      <div className="space-y-1">
        {events.map((event, i) => (
          <div
            key={`${event.type}-${event.timestamp}-${i}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--dk-surface-glass)] transition-colors"
          >
            <ActivityIcon event={event} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">
                {event.mediaItem ? (
                  <Link
                    to="/media/$mediaId"
                    params={{ mediaId: event.mediaItem.id }}
                    className="hover:text-primary transition-colors"
                  >
                    {event.summary}
                  </Link>
                ) : (
                  event.summary
                )}
              </p>
              {event.score != null && (
                <span className="text-xs text-muted-foreground">{event.score}/10</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground/50 shrink-0">
              {formatActivityTime(event.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ActivitySkeleton() {
  return (
    <section className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </section>
  )
}
