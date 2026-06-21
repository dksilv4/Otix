import { Helmet } from 'react-helmet-async'
import { Bell, CheckCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { notificationQueries } from '../queries'
import { useMarkAllRead } from '../hooks/use-mark-all-read'
import { NotificationList } from '../components/organisms/notification-list'

export function NotificationsPage() {
  const { isAuthenticated } = useAuth()
  const markAllRead = useMarkAllRead()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: isAuthenticated,
  })
  const unreadCount = unreadData?.count ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Helmet>
        <title>Notifications - Otix</title>
        <meta name="description" content="Your notifications on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <NotificationList />
    </div>
  )
}
