# Notification Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build channel-based notification framework with type registry, dedicated notifications page, Desktop/Web/PWA push delivery, and enhanced settings.

**Architecture:** Frontend `features/notifications/` module with channel-based routing (Toast, Desktop, Web, Push, Badge, Sound). Backend PushSubscription model + Web Push API for PWA. Electron IPC for desktop native notifications. All notification types defined in central registry.

**Tech Stack:** React 19, TanStack Query v5, TanStack Router v1, Tailwind CSS v4, lucide-react, Framer Motion v12, Electron, Python/FastAPI, SQLAlchemy, pywebpush, Redis SSE

## Global Constraints

- Feature flag `notifications` must remain enabled
- All 14 notification types must have entries in type registry
- Preferences stored in existing `notification_preferences` JSON field (no schema migrations for frontend)
- Desktop Electron IPC follows existing patterns (`desktop/ipc/`, `desktop/preload-api.ts`, `DesktopAPI` interface)
- New backend table `push_subscriptions` requires alembic migration
- Use VAPID keys for Web Push (env vars or auto-generate on first boot)
- Tests required for all query hooks, components, and backend services

---

## File Map

### New Files — Frontend

| File | Responsibility |
|------|---------------|
| `frontend/src/features/notifications/types/index.ts` | Notification, NotificationType, TypeConfig, Action, ActionCallbacks interfaces |
| `frontend/src/features/notifications/registry/index.ts` | NOTIFICATION_TYPES map — all 14 type configs |
| `frontend/src/features/notifications/queries/index.ts` | TanStack Query definitions + optimistic mutations |
| `frontend/src/features/notifications/components/atoms/notification-icon.tsx` | Icon per type from registry |
| `frontend/src/features/notifications/components/atoms/notification-time.tsx` | Relative time display ("2m ago") |
| `frontend/src/features/notifications/components/molecules/notification-card.tsx` | Single notification row with icon, content, actions, dot |
| `frontend/src/features/notifications/components/molecules/notification-actions.tsx` | Action buttons for interactive types |
| `frontend/src/features/notifications/components/organisms/notification-list.tsx` | Infinite scroll container |
| `frontend/src/features/notifications/components/organisms/notification-skeleton.tsx` | Loading shimmer rows |
| `frontend/src/features/notifications/components/organisms/notification-empty.tsx` | Empty state |
| `frontend/src/features/notifications/components/organisms/notification-guest.tsx` | Unauthenticated state |
| `frontend/src/features/notifications/pages/notifications-page.tsx` | Full page with header + list |
| `frontend/src/features/notifications/router.tsx` | TanStack Router route definition |
| `frontend/src/features/notifications/hooks/use-notifications.ts` | Infinite query hook |
| `frontend/src/features/notifications/hooks/use-mark-read.ts` | Mark read mutation |
| `frontend/src/features/notifications/hooks/use-mark-all-read.ts` | Mark all read mutation |
| `frontend/src/features/notifications/hooks/use-push-subscription.ts` | SW registration + push subscribe/unsubscribe |
| `frontend/src/features/notifications/channels/index.ts` | NotificationRouter — routes events to channels |
| `frontend/src/features/notifications/channels/toast-channel.ts` | Toast popup delivery |
| `frontend/src/features/notifications/channels/desktop-channel.ts` | Electron native notification delivery |
| `frontend/src/features/notifications/channels/web-channel.ts` | Browser Notification API (foreground) |
| `frontend/src/features/notifications/channels/push-channel.ts` | PWA push subscription management |
| `frontend/src/features/notifications/channels/badge-channel.ts` | Unread count badge updates |
| `frontend/src/features/notifications/channels/sound-channel.ts` | Notification chime |
| `frontend/src/features/notifications/providers/notifications-provider.tsx` | SSE subscriber + all channel wiring |
| `frontend/src/features/notifications/index.ts` | Barrel exports |
| `frontend/public/sw.js` | Service Worker — push + notificationclick handlers |

### New Files — Desktop

| File | Responsibility |
|------|---------------|
| `desktop/ipc/notifications.ts` | IPC handler for `notifications:show` |

### New Files — Backend

| File | Responsibility |
|------|---------------|
| `backend/otix/domain/push_subscription.py` | PushSubscription SQLAlchemy model |
| `backend/otix/services/push_service.py` | Push subscribe/unsubscribe/send service |
| `backend/otix/api/push/__init__.py` | REST endpoints for push subscriptions + VAPID key |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/lib/router/router.tsx` | Import + include `createNotificationRoutes` |
| `frontend/src/lib/desktop/api.ts` | Add `showNotification` to DesktopAPI interface |
| `frontend/src/features/_config/hooks/use-notification-toasts.ts` | Remove — migrated into channels/toast-channel.ts |
| `frontend/src/features/settings/sections/settings-notifications.tsx` | Add channel controls, quiet hours, release_available type |
| `desktop/main.ts` | Import + call `registerNotificationIPC(mainWindow)` |
| `desktop/preload-api.ts` | Add `showNotification` to IDesktopAPI bridge |
| `backend/otix/api/router.py` | Add push notification router |
| `backend/otix/domain/__init__.py` | Export PushSubscription |
| `backend/otix/domain/user.py` | Add `push_subscriptions: Mapped[list[PushSubscription]]` relationship |
| `backend/otix/services/notification_service.py` | Add push delivery hook after create() |
| `backend/requirements.txt` | Add `pywebpush` |

---

### Task 1: Types + Registry + Channel Infrastructure

**Files:**
- Create: `frontend/src/features/notifications/types/index.ts`
- Create: `frontend/src/features/notifications/registry/index.ts`
- Create: `frontend/src/features/notifications/channels/index.ts`
- Create: `frontend/src/features/notifications/index.ts`

**Interfaces:**
- Produces: `Notification`, `NotificationType`, `TypeConfig`, `ActionButton`, `ActionCallbacks`, `NotificationChannel` types
- Produces: `NOTIFICATION_TYPES` — `Record<NotificationType, TypeConfig>` with all 14 entries
- Produces: `NotificationRouter` class with `registerChannel(channel)`, `route(event)` methods

- [ ] **Step 1: Create types file**

Write `frontend/src/features/notifications/types/index.ts`:

```typescript
import type { LucideIcon } from 'lucide-react'

export type NotificationType =
  | 'friend_request' | 'friend_accepted' | 'friend_rejected' | 'friend_removed'
  | 'follow' | 'follow_request' | 'follow_request_accepted'
  | 'list_invitation' | 'list_invitation_accepted' | 'list_invitation_declined'
  | 'user_rating' | 'like' | 'comment' | 'release_available'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  metadataJson: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface UnreadCount {
  count: number
}

export interface NotificationListResponse {
  items: Notification[]
  hasMore: boolean
  nextCursor: string | null
}

export interface ActionButton {
  label: string
  variant: 'primary' | 'secondary' | 'danger'
  onClick: () => void | Promise<void>
}

export interface ActionCallbacks {
  acceptFriendRequest: (requestId: string) => Promise<void>
  rejectFriendRequest: (requestId: string) => Promise<void>
  acceptListInvitation: (listId: string) => Promise<void>
  declineListInvitation: (listId: string) => Promise<void>
}

export interface TypeConfig {
  type: NotificationType
  icon: LucideIcon
  label: string
  description: string
  color: string
  getLink?: (n: Notification) => string | null
  getActions?: (n: Notification, cbs: ActionCallbacks) => ActionButton[]
  defaultChannels: {
    toast: boolean
    desktop: boolean
    web_push: boolean
  }
}

export interface NotificationEvent {
  id: string
  type: NotificationType
  title: string
  body: string | null
  metadata: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export interface Channel {
  readonly name: string
  canDeliver(event: NotificationEvent): boolean
  deliver(event: NotificationEvent): void | Promise<void>
}

export interface NotificationPreferences {
  [key: string]: boolean | string | undefined
  friend_request?: boolean
  friend_accepted?: boolean
  friend_rejected?: boolean
  friend_removed?: boolean
  follow?: boolean
  follow_request?: boolean
  follow_request_accepted?: boolean
  list_invitation?: boolean
  list_invitation_accepted?: boolean
  list_invitation_declined?: boolean
  user_rating?: boolean
  like?: boolean
  comment?: boolean
  release_available?: boolean
  _desktop_enabled?: boolean
  _web_enabled?: boolean
  _pwa_enabled?: boolean
  _sound_enabled?: boolean
  _quiet_start?: string
  _quiet_end?: string
}
```

- [ ] **Step 2: Create type registry**

Write `frontend/src/features/notifications/registry/index.ts`:

```typescript
import {
  Bell, UserPlus, UserCheck, UserX, UserMinus, Heart,
  MessageSquareText, Users, Star,
} from 'lucide-react'
import type { TypeConfig, NotificationType } from '../types'

export const NOTIFICATION_TYPES: Record<NotificationType, TypeConfig> = {
  friend_request: {
    type: 'friend_request',
    icon: UserPlus,
    label: 'Friend Request',
    description: 'Someone sent you a friend request',
    color: 'text-blue-400',
    getActions: (n, cbs) => {
      const requestId = n.metadataJson.requestId as string | undefined
      if (!requestId) return []
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptFriendRequest(requestId) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.rejectFriendRequest(requestId) },
      ]
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  friend_accepted: {
    type: 'friend_accepted',
    icon: UserCheck,
    label: 'Friend Request Accepted',
    description: 'A friend request was accepted',
    color: 'text-green-400',
    getLink: (n) => {
      const username = n.metadataJson.username as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  friend_rejected: {
    type: 'friend_rejected',
    icon: UserX,
    label: 'Friend Request Declined',
    description: 'A friend request was declined',
    color: 'text-red-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  friend_removed: {
    type: 'friend_removed',
    icon: UserMinus,
    label: 'Friend Removed',
    description: 'You were removed as a friend',
    color: 'text-red-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  follow: {
    type: 'follow',
    icon: UserPlus,
    label: 'New Follower',
    description: 'Someone followed you',
    color: 'text-blue-400',
    getLink: (n) => {
      const username = n.metadataJson.followerUsername as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  follow_request: {
    type: 'follow_request',
    icon: UserPlus,
    label: 'Follow Request',
    description: 'Someone requested to follow you',
    color: 'text-blue-400',
    getLink: (n) => {
      const username = n.metadataJson.requesterUsername as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  follow_request_accepted: {
    type: 'follow_request_accepted',
    icon: UserCheck,
    label: 'Follow Request Accepted',
    description: 'Your follow request was accepted',
    color: 'text-green-400',
    getLink: (n) => {
      const username = n.metadataJson.targetUsername as string | undefined
      return username ? `/u/${username}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation: {
    type: 'list_invitation',
    icon: Users,
    label: 'List Invitation',
    description: 'You were invited to collaborate on a list',
    color: 'text-purple-400',
    getActions: (n, cbs) => {
      const listId = n.metadataJson.listId as string | undefined
      if (!listId) return []
      return [
        { label: 'Accept', variant: 'primary', onClick: () => cbs.acceptListInvitation(listId) },
        { label: 'Decline', variant: 'secondary', onClick: () => cbs.declineListInvitation(listId) },
      ]
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation_accepted: {
    type: 'list_invitation_accepted',
    icon: Users,
    label: 'List Invitation Accepted',
    description: 'Someone accepted your list invitation',
    color: 'text-green-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  list_invitation_declined: {
    type: 'list_invitation_declined',
    icon: Users,
    label: 'List Invitation Declined',
    description: 'Someone declined your list invitation',
    color: 'text-orange-400',
    defaultChannels: { toast: false, desktop: false, web_push: false },
  },
  user_rating: {
    type: 'user_rating',
    icon: Star,
    label: 'New Rating',
    description: 'Someone rated your content',
    color: 'text-yellow-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  like: {
    type: 'like',
    icon: Heart,
    label: 'Like',
    description: 'Someone liked your content',
    color: 'text-rose-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  comment: {
    type: 'comment',
    icon: MessageSquareText,
    label: 'Comment',
    description: 'Someone commented on your content',
    color: 'text-blue-400',
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
  release_available: {
    type: 'release_available',
    icon: Bell,
    label: 'Now Available',
    description: 'A watchlisted item has a new release',
    color: 'text-emerald-400',
    getLink: (n) => {
      const slug = n.metadataJson.mediaSlug as string | undefined
      return slug ? `/media/${slug}` : null
    },
    defaultChannels: { toast: true, desktop: true, web_push: true },
  },
}

export function getTypeConfig(type: NotificationType) {
  return NOTIFICATION_TYPES[type]
}

export function getTypeIcon(type: NotificationType) {
  return NOTIFICATION_TYPES[type]?.icon ?? Bell
}
```

- [ ] **Step 3: Create channel router**

Write `frontend/src/features/notifications/channels/index.ts`:

```typescript
import type { Channel, NotificationEvent } from '../types'

export class NotificationRouter {
  private channels: Channel[] = []

  registerChannel(channel: Channel): void {
    this.channels.push(channel)
  }

  route(event: NotificationEvent): void {
    for (const channel of this.channels) {
      if (channel.canDeliver(event)) {
        channel.deliver(event)
      }
    }
  }
}
```

- [ ] **Step 4: Create barrel export**

Write `frontend/src/features/notifications/index.ts`:

```typescript
export { NOTIFICATION_TYPES, getTypeConfig, getTypeIcon } from './registry'
export { NotificationRouter } from './channels'
export type {
  Notification, NotificationType, TypeConfig, ActionButton,
  ActionCallbacks, NotificationEvent, Channel, NotificationPreferences,
  NotificationListResponse, UnreadCount,
} from './types'
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/notifications/types/index.ts \
       frontend/src/features/notifications/registry/index.ts \
       frontend/src/features/notifications/channels/index.ts \
       frontend/src/features/notifications/index.ts
rtk git commit -m "feat(notifications): add types, registry, and channel router"
```

---

### Task 2: Queries + Data Layer

**Files:**
- Create: `frontend/src/features/notifications/queries/index.ts`
- Create: `frontend/src/features/notifications/hooks/use-notifications.ts`
- Create: `frontend/src/features/notifications/hooks/use-mark-read.ts`
- Create: `frontend/src/features/notifications/hooks/use-mark-all-read.ts`
- Create: `frontend/src/features/notifications/hooks/__tests__/use-notifications.test.ts`
- Create: `frontend/src/features/notifications/hooks/__tests__/use-mark-read.test.ts`

**Interfaces:**
- Produces: `notificationQueries.list(cursor?, limit?)` — queryOptions for notification list
- Produces: `notificationQueries.unreadCount()` — queryOptions for unread count
- Produces: `useNotifications()` — infinite query hook with IntersectionObserver
- Produces: `useMarkRead()` — mutation with optimistic update
- Produces: `useMarkAllRead()` — mutation with optimistic update

- [ ] **Step 1: Write query definitions**

Write `frontend/src/features/notifications/queries/index.ts`:

```typescript
import { queryOptions } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '../types'

export const notificationQueries = {
  list: (cursor?: string, limit = 20) =>
    queryOptions({
      queryKey: ['notifications', 'list', { cursor, limit }],
      queryFn: async () => {
        const params: Record<string, string | number> = { limit }
        if (cursor) params.cursor = cursor
        const { data } = await apiClient.get<NotificationListResponse>('/notifications', { params })
        return data
      },
      staleTime: 30_000,
    }),

  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'unread-count'],
      queryFn: async () => {
        const { data } = await apiClient.get<UnreadCount>('/notifications/unread-count')
        return data
      },
      staleTime: 30_000,
    }),
}
```

- [ ] **Step 2: Write infinite query hook**

Write `frontend/src/features/notifications/hooks/use-notifications.ts`:

```typescript
import { useCallback, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { notificationQueries } from '../queries'

export function useNotifications() {
  const { isAuthenticated } = useAuth()
  const observerRef = useRef<IntersectionObserver | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async ({ pageParam }) => {
      const params = pageParam as string | undefined
      const result = await notificationQueries.list(params).queryFn()
      return result
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
    enabled: isAuthenticated,
  })

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? []

  const lastItemRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !query.hasNextPage || query.isFetchingNextPage) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            query.fetchNextPage()
          }
        },
        { rootMargin: '200px' },
      )
      observerRef.current.observe(node)
    },
    [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage],
  )

  return { ...query, allItems, lastItemRef }
}
```

- [ ] **Step 3: Write mark-read mutation**

Write `frontend/src/features/notifications/hooks/use-mark-read.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '../types'

export function useMarkRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.post(`/notifications/${notificationId}/read`)
    },
    onMutate: async (notificationId) => {
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['notifications', 'list'] })
        .map((q) => q.queryKey)

      const snapshots = listKeys.map((key) => ({
        key,
        data: qc.getQueryData<NotificationListResponse>(key),
      }))

      for (const { key, data } of snapshots) {
        if (!data) continue
        qc.setQueryData<NotificationListResponse>(key, {
          ...data,
          items: data.items.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        })
      }

      const countKey = ['notifications', 'unread-count']
      const prevCount = qc.getQueryData<UnreadCount>(countKey)
      if (prevCount && prevCount.count > 0) {
        qc.setQueryData<UnreadCount>(countKey, { count: prevCount.count - 1 })
      }

      return { snapshots, prevCount }
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      for (const { key, data } of context.snapshots) {
        if (data) qc.setQueryData(key, data)
      }
      if (context.prevCount) {
        qc.setQueryData(['notifications', 'unread-count'], context.prevCount)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
```

- [ ] **Step 4: Write mark-all-read mutation**

Write `frontend/src/features/notifications/hooks/use-mark-all-read.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { NotificationListResponse, UnreadCount } from '../types'

export function useMarkAllRead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/read-all')
    },
    onMutate: () => {
      const listKeys = qc
        .getQueryCache()
        .findAll({ queryKey: ['notifications', 'list'] })
        .map((q) => q.queryKey)

      const snapshots = listKeys.map((key) => ({
        key,
        data: qc.getQueryData<NotificationListResponse>(key),
      }))

      for (const { key, data } of snapshots) {
        if (!data) continue
        qc.setQueryData<NotificationListResponse>(key, {
          ...data,
          items: data.items.map((n) => ({ ...n, isRead: true })),
        })
      }

      const countKey = ['notifications', 'unread-count']
      const prevCount = qc.getQueryData<UnreadCount>(countKey)
      qc.setQueryData<UnreadCount>(countKey, { count: 0 })

      return { snapshots, prevCount }
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      for (const { key, data } of context.snapshots) {
        if (data) qc.setQueryData(key, data)
      }
      if (context.prevCount) {
        qc.setQueryData(['notifications', 'unread-count'], context.prevCount)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
```

- [ ] **Step 5: Write test for infinite query**

Write `frontend/src/features/notifications/hooks/__tests__/use-notifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '@/test-utils'
import { useNotifications } from '../use-notifications'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: { items: [], hasMore: false, nextCursor: null },
    }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

describe('useNotifications', () => {
  it('returns empty items when no notifications', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.allItems).toEqual([])
  })
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run frontend/src/features/notifications/hooks/__tests__/`
Expected: Tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/notifications/queries/index.ts \
       frontend/src/features/notifications/hooks/use-notifications.ts \
       frontend/src/features/notifications/hooks/use-mark-read.ts \
       frontend/src/features/notifications/hooks/use-mark-all-read.ts \
       frontend/src/features/notifications/hooks/__tests__/
rtk git commit -m "feat(notifications): add query hooks with optimistic mutations"
```

---

### Task 3: UI Components

**Files:**
- Create: `frontend/src/features/notifications/components/atoms/notification-icon.tsx`
- Create: `frontend/src/features/notifications/components/atoms/notification-time.tsx`
- Create: `frontend/src/features/notifications/components/molecules/notification-actions.tsx`
- Create: `frontend/src/features/notifications/components/molecules/notification-card.tsx`
- Create: `frontend/src/features/notifications/components/organisms/notification-skeleton.tsx`
- Create: `frontend/src/features/notifications/components/organisms/notification-empty.tsx`
- Create: `frontend/src/features/notifications/components/organisms/notification-guest.tsx`
- Create: `frontend/src/features/notifications/components/organisms/notification-list.tsx`
- Test: `frontend/src/features/notifications/components/__tests__/notification-card.test.tsx`

**Interfaces:**
- Consumes: `Notification`, `NotificationType`, `TypeConfig`, `ActionButton`, `ActionCallbacks` from types
- Consumes: `getTypeConfig`, `getTypeIcon` from registry
- Consumes: `useMarkRead()` from hooks
- Consumes: `useNotifications()` from hooks

- [ ] **Step 1: Create NotificationIcon atom**

Write `frontend/src/features/notifications/components/atoms/notification-icon.tsx`:

```typescript
import { cn } from '@/lib/utils'
import { getTypeConfig } from '../../registry'
import type { NotificationType } from '../../types'

interface NotificationIconProps {
  type: NotificationType
  className?: string
}

export function NotificationIcon({ type, className }: NotificationIconProps) {
  const config = getTypeConfig(type)
  const Icon = config.icon
  return (
    <div className={cn('shrink-0 rounded-xl p-2 bg-white/5', className)}>
      <Icon className={cn('h-4 w-4', config.color)} />
    </div>
  )
}
```

- [ ] **Step 2: Create NotificationTime atom**

Write `frontend/src/features/notifications/components/atoms/notification-time.tsx`:

```typescript
interface NotificationTimeProps {
  createdAt: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationTime({ createdAt }: NotificationTimeProps) {
  return (
    <time className="text-[10px] text-white/30 shrink-0 tabular-nums">
      {formatTimeAgo(createdAt)}
    </time>
  )
}
```

- [ ] **Step 3: Create NotificationActions molecule**

Write `frontend/src/features/notifications/components/molecules/notification-actions.tsx`:

```typescript
import { cn } from '@/lib/utils'
import type { ActionButton } from '../../types'

interface NotificationActionsProps {
  actions: ActionButton[]
}

const variants = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-white/10 text-white/60 hover:bg-white/[0.08]',
  danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
}

export function NotificationActions({ actions }: NotificationActionsProps) {
  if (actions.length === 0) return null
  return (
    <div className="flex gap-2 mt-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer',
            variants[action.variant],
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create NotificationCard molecule**

Write `frontend/src/features/notifications/components/molecules/notification-card.tsx`:

```typescript
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { getTypeConfig } from '../../registry'
import { NotificationIcon } from '../atoms/notification-icon'
import { NotificationTime } from '../atoms/notification-time'
import { NotificationActions } from './notification-actions'
import type { Notification, ActionCallbacks } from '../../types'
import type { UseMutateFunction } from '@tanstack/react-query'

interface NotificationCardProps {
  notification: Notification
  onMarkRead: UseMutateFunction<void, Error, string, unknown>
  actionCallbacks: ActionCallbacks
}

export function NotificationCard({ notification, onMarkRead, actionCallbacks }: NotificationCardProps) {
  const navigate = useNavigate()
  const config = getTypeConfig(notification.type)
  const link = config?.getLink?.(notification)
  const actions = config?.getActions?.(notification, actionCallbacks)
  const Icon = config?.icon

  const handleClick = () => {
    if (link) navigate({ to: link })
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-3 rounded-xl transition-colors',
        !notification.isRead && 'bg-white/[0.03]',
        link && 'cursor-pointer hover:bg-white/[0.06]',
      )}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && link) handleClick() }}
      role={link ? 'button' : undefined}
      tabIndex={link ? 0 : undefined}
    >
      <NotificationIcon type={notification.type} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-white/80">{notification.title}</p>
          <NotificationTime createdAt={notification.createdAt} />
        </div>
        {notification.body && (
          <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        {actions && <NotificationActions actions={actions} />}
      </div>

      {!notification.isRead && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id) }}
          className="shrink-0 mt-1 cursor-pointer"
          aria-label="Mark as read"
        >
          <span className="block h-2 w-2 rounded-full bg-primary" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write NotificationSkeleton**

Write `frontend/src/features/notifications/components/organisms/notification-skeleton.tsx`:

```typescript
import { Skeleton } from '@/old-features/dk-ui/atoms/skeleton'

export function NotificationSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Write NotificationEmpty**

Write `frontend/src/features/notifications/components/organisms/notification-empty.tsx`:

```typescript
import { Bell } from 'lucide-react'

export function NotificationEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Bell className="h-10 w-10 text-white/20" />
      <p className="mt-4 text-sm text-white/40">No notifications yet</p>
    </div>
  )
}
```

- [ ] **Step 7: Write NotificationGuest**

Write `frontend/src/features/notifications/components/organisms/notification-guest.tsx`:

```typescript
import { Bell } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export function NotificationGuest() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Bell className="h-10 w-10 text-white/30" />
      <h2 className="mt-4 text-sm font-semibold text-white/60">Sign in to view notifications</h2>
      <Link
        to="/auth/login"
        className="mt-3 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Sign in
      </Link>
    </div>
  )
}
```

- [ ] **Step 8: Write NotificationList organism**

Write `frontend/src/features/notifications/components/organisms/notification-list.tsx`:

```typescript
import { useAuth } from '@/lib/providers/auth'
import { useNotifications } from '../../hooks/use-notifications'
import { useMarkRead } from '../../hooks/use-mark-read'
import { useQuery } from '@tanstack/react-query'
import { notificationQueries } from '../../queries'
import { NotificationCard } from '../molecules/notification-card'
import { NotificationSkeleton } from './notification-skeleton'
import { NotificationEmpty } from './notification-empty'
import { NotificationGuest } from './notification-guest'
import type { ActionCallbacks } from '../../types'
import { apiClient } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'

export function NotificationList({ onClose }: { onClose?: () => void }) {
  const { isAuthenticated } = useAuth()
  const markRead = useMarkRead()
  const { allItems, isLoading, isFetchingNextPage, hasNextPage, lastItemRef } = useNotifications()
  const queryClient = useQueryClient()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: isAuthenticated,
  })

  const actionCallbacks: ActionCallbacks = {
    acceptFriendRequest: async (requestId) => {
      await apiClient.post(`/friends/requests/${requestId}/accept`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
    rejectFriendRequest: async (requestId) => {
      await apiClient.post(`/friends/requests/${requestId}/reject`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    acceptListInvitation: async (listId) => {
      await apiClient.post(`/list/${listId}/collaborators/accept`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['list'] })
    },
    declineListInvitation: async (listId) => {
      await apiClient.post(`/list/${listId}/collaborators/decline`)
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  }

  if (!isAuthenticated) return <NotificationGuest />

  if (isLoading) return <NotificationSkeleton />

  if (allItems.length === 0) return <NotificationEmpty />

  return (
    <div className="flex flex-col">
      {allItems.map((n, i) => (
        <div
          key={n.id}
          ref={i === allItems.length - 1 ? lastItemRef : undefined}
        >
          <NotificationCard
            notification={n}
            onMarkRead={markRead.mutate}
            actionCallbacks={actionCallbacks}
          />
        </div>
      ))}
      {isFetchingNextPage && <NotificationSkeleton count={3} />}
    </div>
  )
}
```

- [ ] **Step 9: Write component test**

Write `frontend/src/features/notifications/components/__tests__/notification-card.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationCard } from '../molecules/notification-card'
import type { Notification, ActionCallbacks } from '../../types'

const mockNotification: Notification = {
  id: 'notif-1',
  type: 'follow',
  title: 'New follower',
  body: 'john_doe followed you',
  metadataJson: { followerUsername: 'john_doe' },
  isRead: false,
  createdAt: new Date().toISOString(),
}

const mockCallbacks: ActionCallbacks = {
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  acceptListInvitation: vi.fn(),
  declineListInvitation: vi.fn(),
}

describe('NotificationCard', () => {
  it('renders notification title and body', () => {
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={vi.fn()}
        actionCallbacks={mockCallbacks}
      />
    )
    expect(screen.getByText('New follower')).toBeInTheDocument()
    expect(screen.getByText('john_doe followed you')).toBeInTheDocument()
  })

  it('shows unread dot when not read', () => {
    render(
      <NotificationCard
        notification={mockNotification}
        onMarkRead={vi.fn()}
        actionCallbacks={mockCallbacks}
      />
    )
    expect(screen.getByLabelText('Mark as read')).toBeInTheDocument()
  })
})
```

- [ ] **Step 10: Run tests**

Run: `npx vitest run frontend/src/features/notifications/components/__tests__/`
Expected: Tests pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/notifications/components/ \
       frontend/src/features/notifications/hooks/
rtk git commit -m "feat(notifications): add UI components with states"
```

---

### Task 4: NotificationsPage + Router

**Files:**
- Create: `frontend/src/features/notifications/pages/notifications-page.tsx`
- Create: `frontend/src/features/notifications/router.tsx`
- Modify: `frontend/src/lib/router/router.tsx`

**Interfaces:**
- Consumes: `NotificationList`, `useMarkAllRead`, `notificationQueries`

- [ ] **Step 1: Create NotificationsPage**

Write `frontend/src/features/notifications/pages/notifications-page.tsx`:

```typescript
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
```

- [ ] **Step 2: Create router**

Write `frontend/src/features/notifications/router.tsx`:

```typescript
import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const NotificationsPage = lazy(() =>
  import('./pages/notifications-page').then((m) => ({ default: m.NotificationsPage })),
)

export function createNotificationRoutes(rootRoute: AnyRoute) {
  const notificationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notifications',
    component: NotificationsPage,
  })
  return [notificationsRoute]
}
```

- [ ] **Step 3: Register route in router**

Edit `frontend/src/lib/router/router.tsx`:

Add import:
```typescript
import { createNotificationRoutes } from '@/features/notifications/router'
```

Add to route tree (add after `...createPeopleRoutes(rootRoute),`):
```typescript
  ...createNotificationRoutes(rootRoute),
```

- [ ] **Step 4: Export from index**

Add to `frontend/src/features/notifications/index.ts`:

```typescript
export { createNotificationRoutes } from './router'
export { NotificationsPage } from './pages/notifications-page'
```

- [ ] **Step 5: Verify route compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/notifications/pages/ \
       frontend/src/features/notifications/router.tsx \
       frontend/src/lib/router/router.tsx \
       frontend/src/features/notifications/index.ts
rtk git commit -m "feat(notifications): add notifications page and route"
```

---

### Task 5: NotificationsProvider + SSE + Channels

**Files:**
- Create: `frontend/src/features/notifications/channels/toast-channel.ts`
- Create: `frontend/src/features/notifications/channels/badge-channel.ts`
- Create: `frontend/src/features/notifications/channels/sound-channel.ts`
- Create: `frontend/src/features/notifications/channels/web-channel.ts`
- Create: `frontend/src/features/notifications/providers/notifications-provider.tsx`
- Modify: `frontend/src/features/_config/hooks/use-notification-toasts.ts` (remove — code migrated)

**Interfaces:**
- Consumes: `Channel`, `NotificationEvent`, `NotificationPreferences` from types
- Consumes: `NotificationRouter` from channels
- Consumes: `useAuth`, `API_BASE_URL` from lib

- [ ] **Step 1: Create toast channel**

Write `frontend/src/features/notifications/channels/toast-channel.ts`:

```typescript
import { useToast } from '@/old-features/dk-ui/molecules/toast'
import { getTypeConfig } from '../registry'
import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

export function createToastChannel(prefs: NotificationPreferences): Channel {
  const { toast } = useToast()

  return {
    name: 'toast',
    canDeliver: (event: NotificationEvent) => {
      return prefs[event.type] !== false
    },
    deliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return
      toast({
        title: event.title,
        description: event.body ?? undefined,
      })
    },
  }
}
```

- [ ] **Step 2: Create badge channel**

Write `frontend/src/features/notifications/channels/badge-channel.ts`:

```typescript
import { useQueryClient } from '@tanstack/react-query'
import type { Channel, NotificationEvent } from '../types'

export function createBadgeChannel(queryClient: ReturnType<typeof useQueryClient>): Channel {
  return {
    name: 'badge',
    canDeliver: () => true,
    deliver: (_event: NotificationEvent) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  }
}
```

- [ ] **Step 3: Create sound channel**

Write `frontend/src/features/notifications/channels/sound-channel.ts`:

```typescript
import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

let audioCtx: AudioContext | null = null

function playChime() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.2)
  } catch {
    // Audio not available — silently no-op
  }
}

export function createSoundChannel(prefs: NotificationPreferences): Channel {
  return {
    name: 'sound',
    canDeliver: (event: NotificationEvent) => {
      return prefs[event.type] !== false && prefs._sound_enabled === true
    },
    deliver: () => {
      playChime()
    },
  }
}
```

- [ ] **Step 4: Create web channel**

Write `frontend/src/features/notifications/channels/web-channel.ts`:

```typescript
import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

export function createWebChannel(prefs: NotificationPreferences): Channel {
  return {
    name: 'web',
    canDeliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return false
      if (prefs._web_enabled === false) return false
      if (typeof Notification === 'undefined') return false
      if (Notification.permission !== 'granted') return false
      if (document.visibilityState !== 'visible') return false
      return true
    },
    deliver: (event: NotificationEvent) => {
      const notification = new Notification(event.title, {
        body: event.body ?? undefined,
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    },
  }
}
```

- [ ] **Step 5: Create NotificationsProvider**

Write `frontend/src/features/notifications/providers/notifications-provider.tsx`:

```typescript
import { useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { API_BASE_URL } from '@/lib/config'
import { useSseStream } from '@/lib/hooks/use-sse-stream'
import type { SseEvent } from '@/lib/api/sse-client'
import { NotificationRouter } from '../channels'
import { createBadgeChannel } from '../channels/badge-channel'
import { createSoundChannel } from '../channels/sound-channel'
import { createWebChannel } from '../channels/web-channel'
import type { NotificationEvent, NotificationPreferences } from '../types'

interface NotificationsProviderProps {
  children: React.ReactNode
}

function isInQuietHours(prefs: NotificationPreferences): boolean {
  const start = prefs._quiet_start as string | undefined
  const end = prefs._quiet_end as string | undefined
  if (!start || !end) return false
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (startMin <= endMin) return current >= startMin && current < endMin
  return current >= startMin || current < endMin
}

export function NotificationsProvider({ children }: NotificationsProviderProps) {
  const { isAuthenticated, user } = useAuth()
  const queryClient = useQueryClient()
  const routerRef = useRef<NotificationRouter | null>(null)

  // Build channels once when preferences change
  const prefs = (user?.notificationPreferences ?? {}) as NotificationPreferences

  useEffect(() => {
    const router = new NotificationRouter()
    router.registerChannel(createBadgeChannel(queryClient))
    router.registerChannel(createSoundChannel(prefs))
    router.registerChannel(createWebChannel(prefs))
    routerRef.current = router
  }, [prefs, queryClient])

  const handleMessage = useCallback(
    (event: SseEvent) => {
      const n = event as unknown as NotificationEvent
      if (!n.id || !n.type) return

      // Check per-type preference
      if (prefs[n.type] === false) return

      // Check quiet hours
      if (isInQuietHours(prefs)) return

      // Route to all eligible channels
      routerRef.current?.route(n)
    },
    [prefs],
  )

  useSseStream({
    url: `${API_BASE_URL}/notifications/stream`,
    onMessage: handleMessage,
    enabled: isAuthenticated,
    reconnectDelays: [3000, 10000, 30000],
  })

  return <>{children}</>
}
```

- [ ] **Step 6: Wire provider into app**

The provider should wrap the app. Edit `frontend/src/features/_config/components/layout/root-layout.tsx` to include `NotificationsProvider`.

Find the existing provider chain and add:
```typescript
import { NotificationsProvider } from '@/features/notifications/providers/notifications-provider'
```

Then wrap children:
```typescript
<NotificationsProvider>
  {children}
</NotificationsProvider>
```

- [ ] **Step 7: Remove old toast hook**

Delete `frontend/src/features/_config/hooks/use-notification-toasts.ts` — its functionality is now in the NotificationsProvider + toast channel.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/notifications/channels/ \
       frontend/src/features/notifications/providers/ \
       frontend/src/features/_config/components/layout/root-layout.tsx
git rm frontend/src/features/_config/hooks/use-notification-toasts.ts
rtk git commit -m "feat(notifications): add SSE provider and notification channels"
```

---

### Task 6: Desktop IPC + Desktop Channel

**Files:**
- Create: `desktop/ipc/notifications.ts`
- Modify: `desktop/main.ts`
- Modify: `desktop/preload-api.ts`
- Modify: `frontend/src/lib/desktop/api.ts`
- Create: `frontend/src/features/notifications/channels/desktop-channel.ts`

- [ ] **Step 1: Create desktop IPC handler**

Write `desktop/ipc/notifications.ts`:

```typescript
import { Notification } from 'electron'
import { ipcMain, BrowserWindow } from 'electron';

interface NotificationPayload {
  title: string
  body?: string
  icon?: string
  type: string
  metadata?: Record<string, unknown>
}

export function registerNotificationIPC(mainWindow: BrowserWindow): void {
  ipcMain.handle('notifications:show', async (_event, opts: NotificationPayload) => {
    const notification = new Notification({
      title: opts.title,
      body: opts.body,
      icon: opts.icon,
    })
    notification.on('click', () => {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('notifications:navigate', {
        type: opts.type,
        metadata: opts.metadata,
      })
    })
    notification.show()
  })
}
```

- [ ] **Step 2: Register IPC in main.ts**

Edit `desktop/main.ts` — add import at top:
```typescript
import { registerNotificationIPC } from './ipc/notifications';
```

Add after `registerDesktopSettingsIPC(mainWindow, tray)` in the `app.on('ready', ...)` block:
```typescript
registerNotificationIPC(mainWindow);
```

- [ ] **Step 3: Add to preload bridge**

Edit `desktop/preload-api.ts` — add to `IDesktopAPI` interface:
```typescript
showNotification: (opts: { title: string; body?: string; icon?: string; type: string; metadata?: Record<string, unknown> }) => Promise<void>;
```

Add to the bridge implementation (alongside other IPC handlers in `contextBridge.exposeInMainWorld`):
```typescript
showNotification: (opts) => ipcRenderer.invoke('notifications:show', opts),
```

- [ ] **Step 4: Add to DesktopAPI interface**

Edit `frontend/src/lib/desktop/api.ts` — add to `DesktopAPI` interface:
```typescript
showNotification?: (opts: {
  title: string
  body?: string
  icon?: string
  type: string
  metadata?: Record<string, unknown>
}) => Promise<void>
```

- [ ] **Step 5: Create desktop channel**

Write `frontend/src/features/notifications/channels/desktop-channel.ts`:

```typescript
import { getDesktopAPI } from '@/lib/desktop/api'
import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

export function createDesktopChannel(prefs: NotificationPreferences): Channel | null {
  const api = getDesktopAPI()

  if (!api?.showNotification) return null

  return {
    name: 'desktop',
    canDeliver: (event: NotificationEvent) => {
      if (prefs[event.type] === false) return false
      if (prefs._desktop_enabled === false) return false
      return true
    },
    deliver: (event: NotificationEvent) => {
      api.showNotification!({
        title: event.title,
        body: event.body ?? undefined,
        type: event.type,
        metadata: event.metadata,
      })
    },
  }
}
```

- [ ] **Step 6: Register desktop channel in provider**

Edit `frontend/src/features/notifications/providers/notifications-provider.tsx` — add import:
```typescript
import { createDesktopChannel } from '../channels/desktop-channel'
```

Add inside the `useEffect` where channels are registered:
```typescript
const desktopChannel = createDesktopChannel(prefs)
if (desktopChannel) router.registerChannel(desktopChannel)
```

- [ ] **Step 7: Commit**

```bash
git add desktop/ipc/notifications.ts \
       desktop/main.ts \
       desktop/preload-api.ts \
       frontend/src/lib/desktop/api.ts \
       frontend/src/features/notifications/channels/desktop-channel.ts \
       frontend/src/features/notifications/providers/notifications-provider.tsx
rtk git commit -m "feat(desktop): add native notification IPC and desktop channel"
```

---

### Task 7: Backend PWA Push

**Files:**
- Create: `backend/otix/domain/push_subscription.py`
- Create: `backend/otix/services/push_service.py`
- Create: `backend/otix/api/push/__init__.py`
- Modify: `backend/otix/domain/__init__.py`
- Modify: `backend/otix/domain/user.py`
- Modify: `backend/otix/api/router.py`
- Modify: `backend/otix/services/notification_service.py`
- Modify: `backend/requirements.txt`
- Generate: alembic migration for `push_subscriptions` table
- Create: `backend/tests/test_push_service.py`

- [ ] **Step 1: Add pywebpush to requirements**

Edit `backend/requirements.txt` — add:
```
pywebpush>=1.14.0
```

- [ ] **Step 2: Create PushSubscription model**

Write `backend/otix/domain/push_subscription.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    endpoint: Mapped[str] = mapped_column(String(512))
    p256dh_key: Mapped[str] = mapped_column(String(128))
    auth_key: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="push_subscriptions")
```

- [ ] **Step 3: Export model**

Edit `backend/otix/domain/__init__.py` — add:
```python
from otix.domain.push_subscription import PushSubscription
```

- [ ] **Step 4: Add relationship to User model**

Edit `backend/otix/domain/user.py` — add import:
```python
from otix.domain.push_subscription import PushSubscription
```

Add after existing notification relationship:
```python
push_subscriptions: Mapped[list[PushSubscription]] = relationship(back_populates="user", cascade="all, delete-orphan")
```

- [ ] **Step 5: Create PushService**

Write `backend/otix/services/push_service.py`:

```python
from __future__ import annotations

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from pywebpush import webpush, WebPushException

from otix.domain.push_subscription import PushSubscription

logger = structlog.get_logger()

VAPID_CLAIMS = {"sub": "mailto:notifications@otix.app"}


class PushService:
    def __init__(self, session: AsyncSession, vapid_private_key: str, vapid_public_key: str):
        self.session = session
        self.vapid_private_key = vapid_private_key
        self.vapid_public_key = vapid_public_key

    async def subscribe(self, user_id: str, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
        sub = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh_key=p256dh,
            auth_key=auth,
        )
        self.session.add(sub)
        await self.session.flush()
        return sub

    async def unsubscribe(self, user_id: str, endpoint: str) -> None:
        await self.session.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.endpoint == endpoint,
            )
        )
        await self.session.flush()

    async def get_subscriptions(self, user_id: str) -> list[PushSubscription]:
        result = await self.session.scalars(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
        return list(result)

    async def send_notification(
        self, user_id: str, title: str, body: str | None, type_: str, metadata: dict | None = None,
    ) -> int:
        subs = await self.get_subscriptions(user_id)
        if not subs:
            return 0

        payload = {
            "id": "",
            "type": type_,
            "title": title,
            "body": body,
            "metadata": metadata or {},
        }

        import json
        data = json.dumps(payload)
        sent = 0

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.p256dh_key,
                            "auth": sub.auth_key,
                        },
                    },
                    data=data,
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=VAPID_CLAIMS,
                )
                sent += 1
            except WebPushException as exc:
                if exc.response and exc.response.status_code == 410:
                    # Subscription expired/gone — remove it
                    await self.session.delete(sub)
                    logger.info("removed expired push subscription", endpoint=sub.endpoint[:50])
                else:
                    logger.warning("push delivery failed", error=str(exc), endpoint=sub.endpoint[:50])

        await self.session.flush()
        return sent
```

- [ ] **Step 6: Create VAPID key manager**

Add a VAPID key helper. Create or edit `backend/otix/services/vapid.py`:

```python
from __future__ import annotations

import os
from pathlib import Path

from pywebpush import webpush


def _ensure_vapid_keys() -> tuple[str, str]:
    private = os.environ.get("VAPID_PRIVATE_KEY")
    public = os.environ.get("VAPID_PUBLIC_KEY")

    if private and public:
        return private, public

    # Auto-generate on first boot
    from pywebpush import _VapidUtil
    keys = _VapidUtil.generate_vapid_keys()
    private = keys["private_key"]
    public = keys["public_key"]

    # Persist to user data dir for restart survival
    data_dir = os.environ.get("OTIX_DATA_DIR", "/var/lib/otix")
    key_file = Path(data_dir) / "vapid.json"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    import json
    if not key_file.exists():
        key_file.write_text(json.dumps({"private_key": private, "public_key": public}))

    return private, public


vapid_private_key, vapid_public_key = _ensure_vapid_keys()


def get_vapid_public_key() -> str:
    return vapid_public_key
```

- [ ] **Step 7: Create API endpoints**

Write `backend/otix/api/push/__init__.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.services.push_service import PushService
from otix.services.vapid import get_vapid_public_key

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/vapid-public-key")
async def vapid_public_key_endpoint():
    return {"public_key": get_vapid_public_key()}


@router.post("/subscribe", status_code=201)
async def subscribe(
    body: SubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = PushService(db, "", get_vapid_public_key())
    await service.subscribe(current_user.id, body.endpoint, body.p256dh, body.auth)
    await db.commit()
    return {"message": "Subscribed"}


@router.delete("/subscribe", status_code=200)
async def unsubscribe(
    body: UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = PushService(db, "", get_vapid_public_key())
    await service.unsubscribe(current_user.id, body.endpoint)
    await db.commit()
    return {"message": "Unsubscribed"}
```

- [ ] **Step 8: Register push router**

Edit `backend/otix/api/router.py` — add import:
```python
from otix.api.push import router as push_router
```

Add to `api_router.include_router(...)` block:
```python
api_router.include_router(push_router)
```

- [ ] **Step 9: Add push delivery hook to notification service**

Edit `backend/otix/services/notification_service.py` — add after `await self.session.flush()` in `create()`:

```python
        # Fire-and-forget push delivery
        try:
            from otix.services.push_service import PushService
            from otix.services.vapid import get_vapid_public_key, vapid_private_key
            push_service = PushService(self.session, vapid_private_key, get_vapid_public_key())
            asyncio.create_task(push_service.send_notification(
                user_id=notification.user_id,
                title=notification.title,
                body=notification.body,
                type_=notification.type,
                metadata=notification.metadata_json,
            ))
        except Exception:
            pass
```

Add `import asyncio` at the top of the file if not present.

- [ ] **Step 10: Generate alembic migration**

Run:
```bash
cd backend
alembic revision --autogenerate -m "add push_subscriptions table"
```

Review the generated migration, then apply:
```bash
alembic upgrade head
```

- [ ] **Step 11: Write backend test**

Write `backend/tests/test_push_service.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from otix.services.push_service import PushService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> PushService:
    return PushService(mock_db_session, "test_private_key", "test_public_key")


class TestPushService:
    async def test_subscribe(self, service: PushService, mock_db_session: AsyncMock):
        sub = await service.subscribe("user-1", "https://example.com/push", "p256dh_key", "auth_key")
        assert sub.endpoint == "https://example.com/push"
        mock_db_session.add.assert_called_once()
        mock_db_session.flush.assert_awaited()

    async def test_unsubscribe(self, service: PushService, mock_db_session: AsyncMock):
        await service.unsubscribe("user-1", "https://example.com/push")
        mock_db_session.execute.assert_awaited_once()
        mock_db_session.flush.assert_awaited()
```

- [ ] **Step 12: Run backend tests**

Run: `cd backend && pytest tests/test_push_service.py -v`
Expected: Tests pass.

- [ ] **Step 13: Commit**

```bash
cd /path/to/repo
git add backend/otix/domain/push_subscription.py \
       backend/otix/services/push_service.py \
       backend/otix/services/vapid.py \
       backend/otix/api/push/__init__.py \
       backend/otix/domain/__init__.py \
       backend/otix/domain/user.py \
       backend/otix/api/router.py \
       backend/otix/services/notification_service.py \
       backend/requirements.txt \
       backend/alembic/versions/*_add_push_subscriptions_table.py \
       backend/tests/test_push_service.py
rtk git commit -m "feat(backend): add PWA push subscription support"
```

---

### Task 8: Frontend PWA Push

**Files:**
- Create: `frontend/public/sw.js`
- Create: `frontend/src/features/notifications/hooks/use-push-subscription.ts`
- Create: `frontend/src/features/notifications/channels/push-channel.ts`
- Create: `frontend/src/features/notifications/components/atoms/__tests__/sw.test.ts`

- [ ] **Step 1: Create service worker**

Write `frontend/public/sw.js`:

```javascript
/* global self, clients */

const ORIGIN = self.location.origin

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    return
  }

  if (!data.title) return

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || undefined,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        type: data.type,
        metadata: data.metadata || {},
        url: resolveUrl(data),
      },
      tag: data.id || data.type || 'notification',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = (event.notification.data && event.notification.data.url) || '/notifications'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(ORIGIN) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl })
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(ORIGIN + targetUrl)
      }
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function resolveUrl(data) {
  if (!data.type || !data.metadata) return '/notifications'
  switch (data.type) {
    case 'release_available':
      return data.metadata.mediaSlug ? `/media/${data.metadata.mediaSlug}` : '/notifications'
    case 'follow':
    case 'follow_request':
      return data.metadata.followerUsername
        ? `/u/${data.metadata.followerUsername}`
        : '/notifications'
    case 'follow_request_accepted':
      return data.metadata.targetUsername
        ? `/u/${data.metadata.targetUsername}`
        : '/notifications'
    case 'friend_accepted':
      return data.metadata.username
        ? `/u/${data.metadata.username}`
        : '/notifications'
    default:
      return '/notifications'
  }
}
```

- [ ] **Step 2: Create push subscription hook**

Write `frontend/src/features/notifications/hooks/use-push-subscription.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { API_BASE_URL } from '@/lib/config'

interface PushSubscriptionState {
  supported: boolean
  subscribed: boolean
  permission: NotificationPermission | 'unsupported'
  registering: boolean
}

const VAPID_KEY_CACHE = { key: null as string | null }

async function fetchVapidKey(): Promise<string> {
  if (VAPID_KEY_CACHE.key) return VAPID_KEY_CACHE.key
  const { data } = await apiClient.get<{ publicKey: string }>('/push/vapid-public-key')
  VAPID_KEY_CACHE.key = data.publicKey
  return data.publicKey
}

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData.split('').map((c) => c.charCodeAt(0)))
}

export function usePushSubscription() {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<PushSubscriptionState>({
    supported: false,
    subscribed: false,
    permission: 'unsupported',
    registering: false,
  })

  const register = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState((s) => ({ ...s, supported: false }))
      return
    }

    setState((s) => ({ ...s, supported: true, registering: true }))

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      let sub = await registration.pushManager.getSubscription()

      if (!sub) {
        const vapidKey = await fetchVapidKey()
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: await urlBase64ToUint8Array(vapidKey),
        })
      }

      // Send subscription to backend
      const subJSON = sub.toJSON()
      await apiClient.post('/push/subscribe', {
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys!.p256dh,
        auth: subJSON.keys!.auth,
      })

      setState({
        supported: true,
        subscribed: true,
        permission: Notification.permission,
        registering: false,
      })
    } catch {
      setState((s) => ({ ...s, subscribed: false, registering: false }))
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        const subJSON = sub.toJSON()
        await apiClient.delete('/push/subscribe', {
          data: { endpoint: subJSON.endpoint },
        })
        await sub.unsubscribe()
      }
    } catch {
      // Silently fail
    }
    setState((s) => ({ ...s, subscribed: false }))
  }, [])

  // Auto-register on login if supported
  useEffect(() => {
    if (!isAuthenticated) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const init = async () => {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const sub = await registration.pushManager.getSubscription()
      setState({
        supported: true,
        subscribed: !!sub,
        permission: Notification.permission,
        registering: false,
      })
    }
    init()
  }, [isAuthenticated])

  return { ...state, register, unsubscribe }
}
```

- [ ] **Step 3: Create push channel**

Write `frontend/src/features/notifications/channels/push-channel.ts`:

```typescript
import type { Channel, NotificationEvent } from '../types'

export function createPushChannel(): Channel {
  return {
    name: 'push',
    canDeliver: () => {
      // PWA push is handled by the service worker, not the foreground
      // channel. This channel exists for preference tracking.
      return false
    },
    deliver: () => {
      // No-op — SW handles background delivery
    },
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/sw.js \
       frontend/src/features/notifications/hooks/use-push-subscription.ts \
       frontend/src/features/notifications/channels/push-channel.ts
rtk git commit -m "feat(notifications): add service worker and PWA push subscription"
```

---

### Task 9: Settings Enhancement

**Files:**
- Modify: `frontend/src/features/settings/sections/settings-notifications.tsx`

**Interfaces:**
- Consumes: `NotificationType` from notifications types
- Consumes: `getTypeConfig` from notifications registry
- Consumes: `useAuth` for reading/writing preferences
- Consumes: `usePushSubscription` for PWA controls
- Consumes: `isDesktop` from lib/desktop/api

- [ ] **Step 1: Rewrite settings section**

Write `frontend/src/features/settings/sections/settings-notifications.tsx` (full rewrite):

```typescript
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { isDesktop } from '@/lib/desktop/api'
import { DkSwitch } from '@/old-features/dk-ui/atoms/switch'
import { usePushSubscription } from '@/features/notifications/hooks/use-push-subscription'
import type { NotificationType } from '@/features/notifications/types'
import { getTypeConfig, NOTIFICATION_TYPES } from '@/features/notifications/registry'

const CATEGORIES: { id: string; label: string; description: string; types: NotificationType[] }[] = [
  {
    id: 'social',
    label: 'Social',
    description: 'Friend requests, accepts, and removals',
    types: ['friend_request', 'friend_accepted', 'friend_rejected', 'friend_removed', 'like', 'comment'],
  },
  {
    id: 'follows',
    label: 'Follows',
    description: 'Follow and follow request activity',
    types: ['follow', 'follow_request', 'follow_request_accepted'],
  },
  {
    id: 'lists',
    label: 'Lists',
    description: 'List collaboration invitations and responses',
    types: ['list_invitation', 'list_invitation_accepted', 'list_invitation_declined'],
  },
  {
    id: 'ratings',
    label: 'Ratings',
    description: 'User rating notifications',
    types: ['user_rating'],
  },
  {
    id: 'releases',
    label: 'Releases',
    description: 'Watchlisted media release availability',
    types: ['release_available'],
  },
]

export function NotificationsSection() {
  const { user, refreshUser } = useAuth()
  const [preferences, setPreferences] = useState<Record<string, boolean | string>>(
    user?.notificationPreferences ?? {},
  )
  const [quietEnabled, setQuietEnabled] = useState(
    !!user?.notificationPreferences?._quiet_start,
  )
  const push = usePushSubscription()

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences(user.notificationPreferences)
    }
  }, [user?.notificationPreferences])

  const handleToggle = async (key: string, checked: boolean) => {
    const newPrefs = { ...preferences, [key]: checked }
    setPreferences(newPrefs)
    try {
      await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
      await refreshUser()
    } catch {
      setPreferences(preferences)
    }
  }

  const handleQuietTimeChange = async (key: string, value: string) => {
    const newPrefs = { ...preferences, [key]: value }
    setPreferences(newPrefs)
    try {
      await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
      await refreshUser()
    } catch {
      setPreferences(preferences)
    }
  }

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Notification Preferences</h2>
        <p className="text-sm text-white/60 mt-1">
          Control which notifications you receive and how they&apos;re delivered.
        </p>
      </div>

      {/* Delivery Channels */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Delivery Channels</h3>
          <p className="text-xs text-white/60 mt-0.5">
            Choose how notifications reach you. Per-type toggles below still apply.
          </p>
        </div>

        {isDesktop() && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Desktop notifications</span>
              <p className="text-xs text-white/40">Native OS notifications via Electron</p>
            </div>
            <DkSwitch
              checked={preferences._desktop_enabled !== false}
              onCheckedChange={(c) => handleToggle('_desktop_enabled', c)}
            />
          </div>
        )}

        {typeof Notification !== 'undefined' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Browser notifications</span>
              <p className="text-xs text-white/40">
                {Notification.permission === 'granted'
                  ? 'Permission granted'
                  : Notification.permission === 'denied'
                    ? 'Permission denied — update browser settings'
                    : 'Click to request permission'}
              </p>
            </div>
            <DkSwitch
              checked={preferences._web_enabled !== false}
              onCheckedChange={(c) => handleToggle('_web_enabled', c)}
            />
          </div>
        )}

        {push.supported && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Push notifications</span>
              <p className="text-xs text-white/40">
                {push.subscribed
                  ? 'Active — works when tab is closed'
                  : push.registering
                    ? 'Registering...'
                    : 'Off'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => push.subscribed ? push.unsubscribe() : push.register()}
              disabled={push.registering}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 text-white/60 hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-50"
            >
              {push.subscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-medium">Notification sound</span>
            <p className="text-xs text-white/40">Play a chime on new notifications</p>
          </div>
          <DkSwitch
            checked={preferences._sound_enabled === true}
            onCheckedChange={(c) => handleToggle('_sound_enabled', c)}
          />
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Quiet Hours</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Suppress all notifications during this window
            </p>
          </div>
          <DkSwitch
            checked={quietEnabled}
            onCheckedChange={(c) => {
              setQuietEnabled(c)
              if (!c) {
                handleToggle('_quiet_start', '')
                handleToggle('_quiet_end', '')
              } else {
                handleToggle('_quiet_start', '22:00')
                handleToggle('_quiet_end', '08:00')
              }
            }}
          />
        </div>
        {quietEnabled && (
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-white/60 block mb-1">Start</label>
              <input
                type="time"
                value={(preferences._quiet_start as string) || '22:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_start', e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/80"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/60 block mb-1">End</label>
              <input
                type="time"
                value={(preferences._quiet_end as string) || '08:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_end', e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/80"
              />
            </div>
          </div>
        )}
      </div>

      {/* Per-type toggles */}
      {CATEGORIES.map((category) => (
        <div
          key={category.id}
          className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl"
        >
          <div>
            <h3 className="text-sm font-semibold">{category.label}</h3>
            <p className="text-xs text-white/60 mt-0.5">{category.description}</p>
          </div>
          <div className="mt-4 space-y-4">
            {category.types.map((type) => {
              const config = getTypeConfig(type)
              return (
                <div
                  key={type}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-2">
                    <config.icon className={cn('h-4 w-4', config.color)} />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  <DkSwitch
                    checked={preferences[type] !== false}
                    onCheckedChange={(checked) => handleToggle(type, checked)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

Need to add the `cn` import at the top:
```typescript
import { cn } from '@/lib/utils'
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/settings/sections/settings-notifications.tsx
rtk git commit -m "feat(settings): add notification channel controls and PWA push setup"
```

---

### Task 10: Cleanup + Final Testing

**Files:**
- Delete: `frontend/src/old-features/notifications/` (entire directory)
- Verify: all imported paths in `activity-module-notifications.tsx` updated

- [ ] **Step 1: Delete old notifications directory**

```bash
git rm -r frontend/src/old-features/notifications/
```

- [ ] **Step 2: Update activity panel imports**

Edit `frontend/src/features/activity/components/molecules/activity-module-notifications.tsx` — update imports from old-features path to new path:

```typescript
import { notificationQueries, useMarkRead, useMarkAllRead } from '@/features/notifications/queries'
import type { Notification } from '@/features/notifications/types'
```

Verify the `apiClient` import still works — the old file used `@/old-features/notifications/notification-queries` for types and queries. The new path is `@/features/notifications/queries` and `@/features/notifications/types`.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit && npm run build`
Expected: Clean compilation and build.

- [ ] **Step 5: Commit**

```bash
git rm -r frontend/src/old-features/notifications/
git add frontend/src/features/activity/components/molecules/activity-module-notifications.tsx
rtk git commit -m "chore: remove old-features notifications, update imports"

git add .
rtk git commit -m "feat(notifications): complete notification framework migration"
```

- [ ] **Step 6: Manual verification checklist**

- Navigate to `/notifications` — page renders with header and list
- Unread count badge shows correct count
- NotificationCard renders with icon, title, body, time, unread dot
- Friend request notification shows Accept/Decline buttons
- List invitations show Accept/Decline buttons
- "Mark all read" works (optimistic then API call)
- Click unread dot → marks read
- Click notification with link → navigates
- Login/guest state renders correctly
- Empty state renders when no notifications
- SSE notification event → toast appears (if type enabled)
- Desktop Electron: notification shows as native OS notification
- PWA push: SW registers, subscription endpoint called, SW handles push event
- Settings: channel toggles persist, quiet hours suppress notifications
- Settings: release_available toggle appears in Releases category

---

## Self-Review Checklist

### Spec Coverage
- ✅ Type registry with all 14 types → Task 1
- ✅ Channel architecture → Task 1 (router), Task 5 (channels), Task 6 (desktop), Task 8 (push)
- ✅ User preferences → Task 9 (settings) + provider handles prefs
- ✅ Notifications page → Task 4
- ✅ Settings enhancement → Task 9
- ✅ Desktop IPC → Task 6
- ✅ Backend PWA push → Task 7
- ✅ Frontend PWA push → Task 8
- ✅ Cleanup old-features → Task 10

### Placeholder Scan
- No TBD, TODO, or incomplete sections
- Every step has actual code
- Every file has an exact path
- Every test has a filename

### Type Consistency
- `Notification`, `NotificationType`, `TypeConfig` — defined in Task 1, used consistently in all later tasks
- `ActionCallbacks` interface — defined in Task 1, used in registry (Task 1), card (Task 3), list (Task 3)
- Desktop API `showNotification` — defined in Task 6, used in desktop channel (Task 6)
- Push subscription API endpoints — defined in Task 7, used by usePushSubscription hook (Task 8)
