import { useCallback } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { Bell, CheckCheck, UserPlus, UserCheck, UserX, UserMinus, Heart, MessageSquareText, Users } from 'lucide-react'
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { notificationQueries, useMarkRead, useMarkAllRead, type Notification } from '../notification-queries'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Skeleton } from '@ui/atoms/skeleton'

const TYPE_ICONS: Record<string, typeof Heart> = {
 friend_request: UserPlus,
 friend_accepted: UserCheck,
 friend_rejected: UserX,
 friend_removed: UserMinus,
 like: Heart,
 comment: MessageSquareText,
 list_invitation: Users,
 follow: UserPlus,
 follow_request: UserPlus,
 follow_request_accepted: UserCheck,
}

function getNotificationLink(notification: Notification): string | null {
 const meta = notification.metadataJson ?? {}
 switch (notification.type) {
 case 'follow':
 return meta.follower_username ? `/u/${meta.follower_username}` : null
 case 'follow_request':
 return meta.requester_username ? `/u/${meta.requester_username}` : null
 case 'follow_request_accepted':
 return meta.target_username ? `/u/${meta.target_username}` : null
 default:
 return null
 }
}

function formatTimeAgo(dateStr: string): string {
 const diff = Date.now() - new Date(dateStr).getTime()
 const mins = Math.floor(diff / 60000)
 if (mins < 1) return 'just now'
 if (mins < 60) return `${mins}m ago`
 const hours = Math.floor(mins / 60)
 if (hours < 24) return `${hours}h ago`
 const days = Math.floor(hours / 24)
 if (days < 7) return `${days}d ago`
 return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Infinite query hook ──

function useInfiniteNotifications() {
 const { isAuthenticated } = useAuth()

 return useInfiniteQuery({
 queryKey: ['notifications', 'list'],
 queryFn: async ({ pageParam }) => {
 const params: Record<string, string | number> = { limit: 20 }
 if (pageParam) params.cursor = pageParam as string
 const { data } = await apiClient.get<{
 items: Notification[]
 hasMore: boolean
 nextCursor: string | null
 }>('/notifications', { params })
 return data
 },
 initialPageParam: undefined as string | undefined,
 getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
 staleTime: 1000 * 30,
 enabled: isAuthenticated,
 })
}

// ── Notification row ──

function NotificationRow({
 notification,
 onMarkRead,
}: {
 notification: Notification
 onMarkRead: (id: string) => void
}) {
 const navigate = useNavigate()
 const queryClient = useQueryClient()
 const Icon = TYPE_ICONS[notification.type] ?? Bell
 const isFriendRequest = notification.type === 'friend_request'
 const isListInvitation = notification.type === 'list_invitation'
 const linkUrl = getNotificationLink(notification)

 const handleAction = async (action: 'accept' | 'reject') => {
 const requestId = notification.metadataJson?.requestId as string | undefined
 if (!requestId) return
 try {
 await apiClient.post(`/friends/requests/${requestId}/${action}`)
 queryClient.invalidateQueries({ queryKey: ['notifications'] })
 queryClient.invalidateQueries({ queryKey: ['friends'] })
 } catch {
 // ignored
 }
 }

 const handleListAction = async (action: 'accept' | 'decline') => {
 const listId = notification.metadataJson?.listId as string | undefined
 if (!listId) return
 try {
 await apiClient.post(`/list/${listId}/collaborators/${action}`)
 queryClient.invalidateQueries({ queryKey: ['notifications'] })
 queryClient.invalidateQueries({ queryKey: ['list'] })
 } catch {
 // ignored
 }
 }

 const handleRowClick = () => {
 if (linkUrl) {
 navigate({ to: linkUrl })
 }
 }

 return (
 <div
 className={cn(
 'group relative flex items-start gap-4 p-4 rounded-2xl transition-colors',
 'hover:bg-[var(--dk-surface-glass)]',
 !notification.isRead && 'bg-primary/[0.03]',
 linkUrl && 'cursor-pointer',
 )}
 onClick={handleRowClick}
 onKeyDown={(e) => {
 if (linkUrl && e.key === 'Enter') handleRowClick()
 }}
 role={linkUrl ? 'button' : undefined}
 tabIndex={linkUrl ? 0 : undefined}
 >
 {/* Unread dot */}
 {!notification.isRead && (
 <button
 type="button"
 className="absolute left-1.5 top-1/2 -translate-y-1/2"
 onClick={(e) => {
 e.stopPropagation()
 onMarkRead(notification.id)
 }}
 aria-label="Mark as read"
 >
 <span className="block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
 </button>
 )}

 {/* Icon */}
 <div
 className={cn(
 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
 'bg-[var(--dk-surface-base)] ',
 )}
 >
 <Icon className="h-[18px] w-[18px] text-muted-foreground" />
 </div>

 {/* Content */}
 <div className="min-w-0 flex-1">
 <div className="flex items-baseline justify-between gap-2">
 <p className="text-sm font-semibold">{notification.title}</p>
 <span className="shrink-0 text-[11px] text-muted-foreground/50">
 {formatTimeAgo(notification.createdAt)}
 </span>
 </div>
 {notification.body && (
 <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
 {notification.body}
 </p>
 )}

 {isFriendRequest && (
 <div className="flex gap-2 mt-3">
 <button
 type="button"
 className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
 onClick={(e) => {
 e.stopPropagation()
 handleAction('accept')
 }}
 >
 Accept
 </button>
 <button
 type="button"
 className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
 onClick={(e) => {
 e.stopPropagation()
 handleAction('reject')
 }}
 >
 Decline
 </button>
 </div>
 )}
 {isListInvitation && (
 <div className="flex gap-2 mt-3">
 <button
 type="button"
 className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
 onClick={(e) => {
 e.stopPropagation()
 handleListAction('accept')
 }}
 >
 Accept
 </button>
 <button
 type="button"
 className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors"
 onClick={(e) => {
 e.stopPropagation()
 handleListAction('decline')
 }}
 >
 Decline
 </button>
 </div>
 )}
 </div>
 </div>
 )
}

function NotificationsSkeleton() {
 return (
 <div className="space-y-2">
 {Array.from({ length: 8 }).map((_, i) => (
 <div key={i} className="flex items-start gap-4 p-4">
 <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-4 w-48" />
 <Skeleton className="h-3 w-full max-w-sm" />
 </div>
 </div>
 ))}
 </div>
 )
}

// ── Page ──

export function NotificationsPage() {
 const { isAuthenticated } = useAuth()
 const location = useLocation()
 const markRead = useMarkRead()
 const markAllRead = useMarkAllRead()

 const {
 data,
 isLoading,
 isFetchingNextPage,
 hasNextPage,
 fetchNextPage,
 } = useInfiniteNotifications()

 const allItems = data?.pages.flatMap((p) => p.items) ?? []

 const lastItemRef = useCallback(
 (node: HTMLDivElement | null) => {
 if (!node || !hasNextPage || isFetchingNextPage) return
 const observer = new IntersectionObserver(
 (entries) => {
 if (entries[0]?.isIntersecting) {
 fetchNextPage()
 }
 },
 { rootMargin: '200px' },
 )
 observer.observe(node)
 return () => observer.disconnect()
 },
 [hasNextPage, isFetchingNextPage, fetchNextPage],
 )

 const { data: unreadData } = useQuery({
 ...notificationQueries.unreadCount(),
 enabled: isAuthenticated,
 })
 const unreadCount = unreadData?.count ?? 0

 if (!isAuthenticated) {
 return (
 <div className="flex min-h-[50vh] items-center justify-center">
 <div className="text-center space-y-3">
 <Bell className="mx-auto h-10 w-10 text-muted-foreground/40" />
 <h2 className="text-lg font-semibold">Sign in to view notifications</h2>
 <Link to="/auth/login" search={{ redirect: location.href }} className="text-sm text-primary hover:underline">
 Sign in
 </Link>
 </div>
 </div>
 )
 }

 return (
 <div className="mx-auto lg:max-w-2xl pb-16">
 <Helmet>
 <title>Notifications - Otix</title>
 </Helmet>

 {/* Header */}
 <div className="flex items-center justify-between mb-6">
 <div className="flex items-center gap-3">
 <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
 {unreadCount > 0 && (
 <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
 {unreadCount} new
 </span>
 )}
 </div>
 {unreadCount > 0 && (
 <button
 type="button"
 className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-all"
 onClick={() => markAllRead.mutate()}
 disabled={markAllRead.isPending}
 >
 <CheckCheck className="h-3.5 w-3.5" />
 Mark all read
 </button>
 )}
 </div>

 {/* List */}
 {isLoading ? (
 <NotificationsSkeleton />
 ) : allItems.length === 0 ? (
 <div className="flex min-h-[40vh] items-center justify-center">
 <div className="text-center space-y-3">
 <Bell className="mx-auto h-10 w-10 text-muted-foreground/30" />
 <p className="text-sm text-muted-foreground">No notifications yet</p>
 </div>
 </div>
 ) : (
 <div className="divide-y divide-border/[0.04]">
 {allItems.map((n, i) => (
 <div
 key={n.id}
 ref={i === allItems.length - 1 ? lastItemRef : undefined}
 >
 <NotificationRow
 notification={n}
 onMarkRead={(id) => markRead.mutate(id)}
 />
 </div>
 ))}
 </div>
 )}

 {/* Loading more */}
 {isFetchingNextPage && (
 <div className="flex justify-center py-6">
 <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
 </div>
 )}
 </div>
 )
}
