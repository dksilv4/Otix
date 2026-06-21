import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'

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
