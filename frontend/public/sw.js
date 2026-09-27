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
