# Notification Framework — Design Spec

**Date**: 2026-06-21
**Status**: Approved
**Branch**: `refactor/auth-feature-flag-migration`

## Overview

Rebuild notification system as a unified framework spanning web and desktop (Electron). Move from scattered ad-hoc handling to a channel-based architecture with a centralized type registry, delivering real-time notifications through toast popups, native OS notifications, and browser Notification API — all governed by per-type and per-channel user preferences.

**Design goals:**
- All 14 notification types render correctly (icons, actions, links, colors)
- Desktop Electron & browser share same SSE stream, route to native channels
- PWA push notifications via Service Worker — works when browser tab is closed
- Central type registry — adding a new type is one file edit
- User controls per-type + per-channel + quiet hours
- Migrate old-features/notifications into new feature module

---

## 1. Notification Type Registry

Single source of truth located at `frontend/src/features/notifications/registry/index.ts`. Every notification type gets one entry.

### Types Covered

| Type | Icon | Category | Actions | Link target |
|------|------|----------|---------|-------------|
| `friend_request` | UserPlus | Social | Accept / Decline | — |
| `friend_accepted` | UserCheck | Social | — | `/u/{username}` |
| `friend_rejected` | UserX | Social | — | — |
| `friend_removed` | UserMinus | Social | — | — |
| `follow` | UserPlus | Follows | — | `/u/{username}` |
| `follow_request` | UserPlus | Follows | — | `/u/{username}` |
| `follow_request_accepted` | UserCheck | Follows | — | `/u/{username}` |
| `list_invitation` | Users | Lists | Accept / Decline | — |
| `list_invitation_accepted` | Users | Lists | — | — |
| `list_invitation_declined` | Users | Lists | — | — |
| `user_rating` | Star | Ratings | — | — |
| `like` | Heart | Social | — | — |
| `comment` | MessageSquareText | Social | — | — |
| `release_available` | Bell | Releases | — | `/media/{slug}` |

### TypeConfig Interface

```typescript
interface TypeConfig {
  type: NotificationType
  icon: LucideIcon
  label: string
  description: string
  color: string                                // tailwind color class for dot
  getLink?: (n: Notification) => string | null
  getActions?: (n: Notification, cbs: ActionCallbacks) => ActionButton[]
  defaultChannels: {
    toast: boolean
    desktop: boolean
    web_push: boolean
  }
}
```

### ActionCallbacks

```typescript
interface ActionCallbacks {
  acceptFriendRequest: (requestId: string) => Promise<void>
  rejectFriendRequest: (requestId: string) => Promise<void>
  acceptListInvitation: (listId: string) => Promise<void>
  declineListInvitation: (listId: string) => Promise<void>
}
```

---

## 2. Channel Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    NOTIFICATION DELIVERY                    │
├───────────────────────────┬──────────────────────────────┤
│     APP OPEN (foreground)  │    APP CLOSED (background)   │
├───────────────────────────┼──────────────────────────────┤
│  SSE Stream               │  Web Push API                │
│  (/notifications/stream)  │  (Service Worker)            │
│         │                 │         │                     │
│         ▼                 │         ▼                     │
│  NotificationsProvider    │  Service Worker              │
│         │                 │  (sw.js)                     │
│     NotificationRouter    │         │                     │
│    ┌────┼────┬────┬─┐     │    ┌────┴────┐               │
│    ▼    ▼    ▼    ▼ ▼     │    ▼         ▼               │
│  Toast Desk Web Badge Snd │  Data Push  NotificationClick│
│                           │  (store)    (open app + nav) │
└───────────────────────────┴──────────────────────────────┘
```

### NotificationsProvider

File: `providers/notifications-provider.tsx`

- Wraps app, subscribes SSE stream from `useSseStream`
- On each event:
  1. Validate event shape
  2. Check user `notificationPreferences[type]` — skip if false
  3. Check quiet hours — skip if within window
  4. Pass to `NotificationRouter`
  5. Invalidate TanStack query cache (`['notifications']`)

### Toast Channel

File: `channels/toast-channel.ts`

- Migrate from `_config/hooks/use-notification-toasts.ts`
- Always active (gated by per-type preference + quiet hours)
- Uses dk-ui toast system (already wired)
- On desktop: clicking toast IPC's main process to focus window + navigate

### Desktop Channel (Electron)

File: `channels/desktop-channel.ts`

- Guard: `window.desktopAPI` exists
- Calls `desktopAPI.showNotification({ title, body, icon, type, metadata })`
- Electron main process creates `new Notification()` and handles click:
  - Focus app window
  - Send `notifications:navigate` event to renderer with type + metadata
  - Renderer navigates to type-specific page (e.g. `/media/{slug}` for releases)

**IPC Registration:**

New file: `desktop/ipc/notifications.ts`

```typescript
ipcMain.handle('notifications:show', async (_event, opts) => {
  const notification = new Notification({ title: opts.title, body: opts.body })
  notification.on('click', () => {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('notifications:navigate', opts)
  })
  notification.show()
})
```

Registered in `desktop/main.ts` at startup.

**Preload addition** (`desktop/preload-api.ts`):

```typescript
showNotification: (opts: NotificationPayload) => ipcRenderer.invoke('notifications:show', opts)
```

**Desktop API interface** (`frontend/src/lib/desktop/api.ts`):

```typescript
interface DesktopAPI {
  // ...existing...
  showNotification?: (opts: {
    title: string
    body?: string
    icon?: string
    type: string
    metadata?: Record<string, unknown>
  }) => Promise<void>
}
```

### Web Notification Channel (Browser — Foreground)

File: `channels/web-channel.ts`

- Guard: app is focused/visible AND `'Notification' in window` && `Notification.permission === 'granted'`
- On SSE event while tab is active → `new Notification(title, { body, icon })`
- `onclick` → `window.focus()`, dispatch custom event for router navigation
- Permission flow handled in settings UI

### PWA Push Channel (Browser — Background)

File: `channels/push-channel.ts`

Delivers notifications when browser tab is closed via Service Worker + Web Push API.

**Flow:**
1. App registers Service Worker on startup (if supported)
2. On login, subscribes to push with VAPID public key → POSTs subscription to backend
3. Backend stores push subscriptions per user
4. Backend sends Web Push message when notification is created
5. Service Worker receives `push` event → creates OS notification
6. User clicks notification → Service Worker `notificationclick` event → opens/focuses app at correct route

**Service Worker file:** `public/sw.js`

```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { type: data.type, metadata: data.metadata },
      tag: data.id || data.type,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = resolveNotificationUrl(event.notification.data)
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url })
          return client.focus()
        }
      }
      if (clients.openWindow) clients.openWindow(url)
    })
  )
})
```

**VAPID Keys:**
- Generated once per backend instance (or set via `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` env vars)
- Public key exposed at `GET /push/vapid-public-key`
- Frontend fetches on mount, passes to `registration.pushManager.subscribe()`

### Badge Channel

File: `channels/badge-channel.ts`

- Updates activity panel notification count via query
- Updates document title: `(3) Otix` when unread count > 0
- Favicon badge via canvas/favicon API (if supported)

### Sound Channel

File: `channels/sound-channel.ts`

- Short chime on new notification when `_sound_enabled` is true
- Web Audio API tone or small audio asset
- Nothing fancy — subtle ping

---

## 3. User Preferences

Extended `notificationPreferences` JSON on User model:

```json
{
  "friend_request": true,
  "friend_accepted": true,
  "friend_rejected": false,
  "friend_removed": false,
  "follow": true,
  "follow_request": true,
  "follow_request_accepted": true,
  "list_invitation": true,
  "list_invitation_accepted": false,
  "list_invitation_declined": false,
  "user_rating": true,
  "like": true,
  "comment": true,
  "release_available": true,
  "_desktop_enabled": true,
  "_web_enabled": true,
  "_pwa_enabled": true,
  "_sound_enabled": false,
  "_quiet_start": "22:00",
  "_quiet_end": "08:00"
}
```

Underscore-prefixed keys are channel-level globals. `false` per-type blocks all channels. `true` per-type + channel global enables that channel for that type.

No backend migration needed — JSON field already stores arbitrary keys. Frontend reads/writes via existing `/auth/me` PATCH.

---

## 4. Notifications Page

Migrate from `old-features/notifications/pages/notifications-page.tsx` to `features/notifications/pages/notifications-page.tsx`.

### Route

File: `features/notifications/router.tsx`

```typescript
export function createNotificationRoutes(rootRoute: AnyRoute) {
  const notificationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notifications',
    component: lazy(() => import('./pages/notifications-page')),
  })
  return [notificationsRoute]
}
```

Registered in `lib/router/router.tsx` alongside existing route creators.

### Page Composition

```
NotificationsPage
├── Header (title + unread count badge + mark-all-read button)
└── NotificationList (infinite scroll)
    └── NotificationCard (per row)
        ├── NotificationIcon (from registry)
        ├── Content (title, body, time ago)
        ├── NotificationActions (from registry, if any)
        └── Unread dot (click to mark read)
```

### States

- **Loading**: Skeleton rows (8x shimmer)
- **Empty**: Bell icon + "No notifications yet"
- **Guest/Unauthenticated**: "Sign in to view notifications" + sign-in link
- **Error**: Error state with retry (TanStack Query handles)
- **Edge**: Single notification, overflow (>100), real-time insertion at top

### Data

Queries file (`queries/index.ts`):

- `useNotifications()` — infinite query, cursor-based pagination, 20 per page, IntersectionObserver trigger
- `useUnreadCount()` — polling every 30s (existing pattern)
- `useMarkRead()` — optimistic mutation with rollback on error
- `useMarkAllRead()` — optimistic mutation with rollback

Migrate from `old-features/notifications/notification-queries.ts` — same logic, moved to new module.

---

## 5. Settings Enhancement

File: `features/settings/sections/settings-notifications.tsx`

### Layout

1. **Delivery Channels** section (new, top):
   - Desktop notifications toggle (shown only when `isDesktop()`)
   - Browser notifications toggle (shown only in browser, triggers `Notification.requestPermission()`)
   - PWA push notifications toggle (shown only when browser supports Service Worker)
   - Permission status indicator for each channel (granted/denied/default)
   - Notification sound toggle

2. **Quiet Hours** section (new):
   - Quiet hours toggle
   - Start time / End time inputs

3. **Per-type toggles** (existing, extended):
   - Add missing `release_available` type
   - Grouped by category (Social, Follows, Lists, Ratings, Releases)

---

## 6. File Structure

```
frontend/src/features/notifications/
├── components/
│   ├── atoms/
│   │   ├── notification-icon.tsx
│   │   └── notification-time.tsx
│   ├── molecules/
│   │   ├── notification-card.tsx
│   │   └── notification-actions.tsx
│   └── organisms/
│       ├── notification-list.tsx
│       ├── notification-skeleton.tsx
│       ├── notification-empty.tsx
│       └── notification-guest.tsx
├── pages/
│   └── notifications-page.tsx
├── hooks/
│   ├── use-notifications.ts
│   ├── use-mark-read.ts
│   └── use-mark-all-read.ts
├── queries/
│   └── index.ts
├── types/
│   └── index.ts
├── channels/
│   ├── index.ts
│   ├── toast-channel.ts
│   ├── desktop-channel.ts
│   ├── web-channel.ts
│   ├── push-channel.ts              # PWA push subscription management
│   ├── badge-channel.ts
│   └── sound-channel.ts
├── registry/
│   └── index.ts
├── providers/
│   └── notifications-provider.tsx
├── router.tsx
├── hooks/
│   └── use-push-subscription.ts     # SW registration + push subscribe/unsubscribe
└── index.ts
```

---

## 7. Desktop IPC Changes

| File | Change |
|------|--------|
| `desktop/ipc/notifications.ts` | New — `notifications:show` handler |
| `desktop/main.ts` | Import & call `registerNotificationIPC(mainWindow)` |
| `desktop/preload-api.ts` | Add `showNotification` to bridge |
| `frontend/src/lib/desktop/api.ts` | Add `showNotification` method to `DesktopAPI` interface |

---

## 8. Backend Changes

### Existing (unchanged)

| Component | Status |
|-----------|--------|
| Notification model | Done — `notifications` table |
| NotificationService | Done — CRUD + cursor pagination |
| REST endpoints (`/notifications`) | Done — list, unread-count, mark-read, read-all |
| SSE stream (`/notifications/stream`) | Done — Redis pub/sub |
| Celery release task | Done — `check_media_release_task` |
| `notification_preferences` JSON field | Done — stores per-type + channel toggles |

### New — PWA Push Subscriptions

**Model** — `backend/otix/domain/push_subscription.py`:

```python
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

**Alembic migration** for `push_subscriptions` table.

**Service** — `backend/otix/services/push_service.py`:

```python
class PushService:
    async def subscribe(self, user_id: str, endpoint: str, p256dh: str, auth: str) -> PushSubscription
    async def unsubscribe(self, user_id: str, endpoint: str) -> None
    async def get_subscriptions(self, user_id: str) -> list[PushSubscription]
    async def send_notification(self, notification: Notification, subscriptions: list[PushSubscription]) -> int
```

Uses `pywebpush` library to encrypt and send Web Push messages. VAPID keys generated on first startup or set via env vars (`VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`). Failed endpoints (410 Gone) auto-removed.

**API endpoints** — `backend/otix/api/push/__init__.py`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/push/vapid-public-key` | Return VAPID public key for subscription |
| POST | `/push/subscribe` | Register push subscription |
| DELETE | `/push/subscribe` | Remove push subscription |

Registered in `backend/otix/api/router.py`.

**Hooks** — After `NotificationService.create()`, enqueue push sending via background task:

```python
async def create(self, ...) -> Notification:
    notification = ...
    self.session.add(notification)
    await self.session.flush()
    # Fire-and-forget push delivery (non-blocking)
    asyncio.create_task(_deliver_push(notification))
    return notification
```

Or via Celery task if Redis is preferred for async dispatch.

### Misc

| File | Change |
|------|--------|
| `backend/otix/domain/user.py` | Add `push_subscriptions` relationship |
| `backend/otix/domain/__init__.py` | Export PushSubscription |
| `backend/requirements.txt` | Add `pywebpush` dependency |

---

## 9. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| SSE disconnected | Exponential backoff reconnection (3s → 10s → 30s) |
| Desktop channel unavailable (no Electron) | Silently no-op |
| Web Notification permission denied | Silently no-op, show status in settings |
| PWA push not supported (no SW) | Channel silently no-op |
| Push subscription endpoint 410 Gone | Backend auto-removes stale subscription |
| Push delivery fails (network) | Backend retries once, logs failure |
| SW push event with no notification data | SW ignores event gracefully |
| Notification arrives during quiet hours | Suppressed at router level, visible in inbox on open |
| Optimistic mutation fails | Rollback cached state, toast error |
| Very old cursor | Last page = empty, hasMore = false |
| Type with no icon in registry | Fallback Bell icon |
| Multiple rapid notifications | Batch toast with count after debounce |
| Desktop notification click while app closed | No-op (Electron not running) |
| Notification for deleted media/item | Link goes to 404 page gracefully |

---

## 10. Testing

| Area | Approach |
|------|----------|
| Query hooks | Vitest + MSW — mock API responses, verify cache updates |
| NotificationCard | Vitest + Testing Library — render all type variants |
| Pages (guest/empty/loading) | Vitest + Testing Library — each state renders correctly |
| Mutations (markRead/markAllRead) | Verify optimistic update + rollback |
| Desktop channel | Unit test guard logic (desktop API present/absent) |
| Web channel | Mock Notification API, verify call |
| PWA push channel | Mock `pushManager.subscribe`, verify subscription API call |
| Service Worker | Unit test push/notificationclick event handlers |
| Backend PushSubscription model | Test create, delete, get_by_user |
| Backend push sending | Mock pywebpush, verify encrypt + send |
| E2E | Playwright — login, SSE event triggers notification display |
| Backend | Existing test_notification_service.py covers service layer |

---

## 11. Migration Path

1. Build registry + types + channels (no visible change)
2. Build NotificationsProvider, wire SSE stream → channels
3. Migrate queries from old-features into new module
4. Build notifications page components
5. Wire route in router
6. Add desktop IPC + preload changes
7. Backend: PushSubscription model + migration + PushService + API endpoints
8. Frontend: Service worker + usePushSubscription hook + push channel
9. Extend settings with channel controls + release_available type
10. Delete old-features/notifications
11. Test all 14 types end-to-end across all delivery channels
