import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/features/auth/auth-provider'
import { notificationQueries, useMarkRead, useMarkAllRead, type Notification } from '../notification-queries'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'

const pillBase = cn(
  'flex items-center rounded-[2rem]',
  'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
  'backdrop-blur-lg',
  'shadow-[var(--dk-shadow-glass)]',
)

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationBell({ bare }: { bare?: boolean }) {
  const { isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 15000,
  })

  const { data: listData } = useQuery({
    ...notificationQueries.list(),
    enabled: open && isAuthenticated,
  })

  const notifications = listData?.items ?? []
  const unreadCount = unreadData?.count ?? 0

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-notification-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false)
    })
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  const handleAction = async (notification: Notification, action: 'accept' | 'reject') => {
    const requestId = notification.metadataJson?.requestId as string | undefined
    if (!requestId) return
    try {
      await apiClient.post(`/friends/requests/${requestId}/${action}`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    } catch {
      // ignored
    }
  }

  const handleListAction = async (notification: Notification, action: 'accept' | 'decline') => {
    const listId = notification.metadataJson?.listId as string | undefined
    if (!listId) return
    try {
      await apiClient.post(`/list/${listId}/collaborators/${action}`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['list'] })
    } catch {
      // ignored
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="relative">
      <button
        type="button"
        data-notification-trigger
        onClick={() => setOpen(!open)}
        className={cn(!bare && pillBase, !bare && 'p-1.5', 'cursor-pointer relative')}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute right-0 top-full mt-2 z-[9999]',
              'w-80 max-h-[28rem] overflow-y-auto p-3 rounded-[1.5rem]',
              'bg-[var(--dk-surface-overlay)]',
              'backdrop-blur-xl',
              'shadow-[var(--dk-shadow-glass)]',
              'flex flex-col gap-1',
            )}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                >
                  Mark all read
                </button>
              )}
            </div>

            {!notifications || notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No notifications
              </p>
            ) : (
              <>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 p-2 rounded-xl',
                      !n.isRead && 'bg-primary/[0.04]',
                    )}
                  >
                    <DkAvatar
                      name={n.type === 'friend_request' ? '?' : n.type === 'friend_rejected' ? '✕' : n.type === 'friend_removed' ? '−' : n.type === 'list_invitation' ? '👥' : ''}
                      size="sm"
                      className="shrink-0 mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {formatTimeAgo(n.createdAt)}
                      </p>
                      {n.type === 'friend_request' && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                            onClick={() => handleAction(n, 'accept')}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                            onClick={() => handleAction(n, 'reject')}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {n.type === 'list_invitation' && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
                            onClick={() => handleListAction(n, 'accept')}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
                            onClick={() => handleListAction(n, 'decline')}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        className="shrink-0 mt-0.5"
                        onClick={() => markRead.mutate(n.id)}
                      >
                        <span className="block h-2 w-2 rounded-full bg-primary" />
                      </button>
                    )}
                  </div>
                ))}
                <Link
                  to="/notifications"
                  className="block w-full rounded-xl bg-[var(--dk-surface-glass)] py-2.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-all mt-2"
                  onClick={() => setOpen(false)}
                >
                  View all
                </Link>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
