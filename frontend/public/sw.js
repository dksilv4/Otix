/* global self, clients */

const ORIGIN = self.location.origin
const STATIC_CACHE = 'otix-static-v1'
const MEDIA_CACHE = 'otix-media-v1'
const CURRENT_CACHES = [STATIC_CACHE, MEDIA_CACHE]
const MAX_MEDIA_ENTRIES = 250

// Trusted image CDN hostnames for runtime media caching
const MEDIA_HOSTS = new Set([
  'image.tmdb.org',
  'images.igdb.com',
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
])

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => !CURRENT_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      ),
      clients.claim(),
    ]),
  )
})

// Prune media cache when it exceeds max entries to preserve storage quota
async function trimMediaCache() {
  try {
    const cache = await caches.open(MEDIA_CACHE)
    const keys = await cache.keys()
    if (keys.length > MAX_MEDIA_ENTRIES) {
      const deleteCount = keys.length - MAX_MEDIA_ENTRIES
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i])
      }
    }
  } catch {
    // Non-blocking cache trim error
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // 1. Never intercept /api/*, /auth/*, or websocket requests:
  // TanStack Query persister has sole ownership of API state and caching.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/ws/')
  ) {
    return
  }

  // 2. Runtime caching for immutable Media CDN images (TMDB, IGDB, Steam static)
  if (MEDIA_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached

        return fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const resClone = res.clone()
              caches.open(MEDIA_CACHE).then((cache) => {
                cache.put(req, resClone).then(trimMediaCache)
              })
            }
            return res
          })
          .catch(() => cached || new Response('', { status: 408, statusText: 'Request Timeout' }))
      }),
    )
    return
  }

  // 3. Cache-first strategy for versioned static application assets (JS, CSS, fonts, SVG)
  const isStaticAsset =
    url.origin === ORIGIN &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.woff') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png'))

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached

        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone))
          }
          return res
        })
      }),
    )
    return
  }

  // 4. HTML navigations: Network-first with cache fallback to /index.html for SPA routing
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match('/index.html')
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
      }),
    )
  }
})

// Web Push Notification Listeners (Preserved)
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // When the app is focused, SSE + in-page channels already deliver.
      // Skip the OS toast so open tabs don't get duplicates.
      if (clientList.some((client) => client.focused)) return

      return self.registration.showNotification(data.title, {
        body: data.body || undefined,
        icon: '/icons/180.png',
        badge: '/icons/64.png',
        data: {
          type: data.type,
          metadata: data.metadata || {},
          url: resolveUrl(data),
        },
        tag: data.id || data.type || 'notification',
      })
    }),
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
    }),
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
    case 'studio_release': {
      const mediaType = data.metadata.mediaType
      const mediaId = data.metadata.mediaId
      return mediaType && mediaId != null
        ? `/media/${mediaType}/${mediaId}`
        : '/notifications'
    }
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
