import { useEffect, useState, useCallback } from 'react'
import { isAxiosError } from 'axios'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { isDesktop } from '@/lib/desktop/api'

interface PushSubscriptionState {
  supported: boolean
  subscribed: boolean
  permission: NotificationPermission | 'unsupported'
  registering: boolean
  error: string | null
  /** Why Enable is unavailable (auth / desktop / insecure origin). */
  blockedReason: string | null
}

const VAPID_KEY_CACHE = { key: null as string | null }

function pushApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

async function fetchVapidKey(): Promise<string> {
  if (VAPID_KEY_CACHE.key) return VAPID_KEY_CACHE.key
  const { data } = await apiClient.get<{ publicKey?: string; public_key?: string }>('/push/vapid-public-key')
  const key = data?.publicKey || data?.public_key
  if (!key) throw new Error('VAPID public key missing from server')
  VAPID_KEY_CACHE.key = key.trim()
  return VAPID_KEY_CACHE.key
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = (base64String || '').trim()
  const padding = '='.repeat((4 - (clean.length % 4)) % 4)
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

function applicationServerKeyFromVapid(vapidKey: string): Uint8Array {
  return urlBase64ToUint8Array(vapidKey.trim())
}

function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { detail?: unknown; message?: unknown } | undefined
    if (typeof data?.detail === 'string' && data.detail) return data.detail
    if (typeof data?.message === 'string' && data.message) return data.message
    if (err.response?.status) return `Server error (${err.response.status})`
    return err.message || 'Network error'
  }
  if (err instanceof Error && err.message) {
    if (err.message.toLowerCase().includes('push service error')) {
      return 'Push service error. If you are using Brave Browser, enable "Use Google services for push messaging" in Settings > Privacy.'
    }
    return err.message
  }
  return 'Failed to enable push'
}

export function usePushSubscription() {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<PushSubscriptionState>({
    supported: false,
    subscribed: false,
    permission: 'unsupported',
    registering: false,
    error: null,
    blockedReason: null,
  })

  const refresh = useCallback(async () => {
    if (isDesktop()) {
      setState({
        supported: true,
        subscribed: false,
        permission: 'unsupported',
        registering: false,
        error: null,
        blockedReason:
          'Web push is not available in the desktop app — use Desktop notifications above',
      })
      return
    }

    if (!pushApiAvailable()) {
      const insecure = typeof window !== 'undefined' && !window.isSecureContext
      setState({
        supported: insecure,
        subscribed: false,
        permission: 'unsupported',
        registering: false,
        error: null,
        blockedReason: insecure ? 'Push requires HTTPS (or localhost)' : null,
      })
      return
    }

    const permission =
      typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

    let subscribed: boolean
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      subscribed = !!(await registration.pushManager.getSubscription())
    } catch (err) {
      setState({
        supported: true,
        subscribed: false,
        permission,
        registering: false,
        error: null,
        blockedReason: errorMessage(err),
      })
      return
    }

    setState({
      supported: true,
      subscribed,
      permission,
      registering: false,
      error: null,
      blockedReason: isAuthenticated ? null : 'Sign in to enable push notifications',
    })
  }, [isAuthenticated])

  const register = useCallback(async () => {
    if (isDesktop()) {
      setState((s) => ({
        ...s,
        error: 'Web push is not available in the desktop app',
        registering: false,
      }))
      return
    }
    if (!isAuthenticated) {
      setState((s) => ({
        ...s,
        error: 'Sign in to enable push notifications',
        registering: false,
      }))
      return
    }
    if (!pushApiAvailable()) {
      setState((s) => ({
        ...s,
        supported: false,
        error: 'Push not supported in this browser',
        registering: false,
      }))
      return
    }

    setState((s) => ({ ...s, supported: true, registering: true, error: null }))

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        throw new Error(
          'Notification permission denied — allow notifications in browser settings',
        )
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      let sub = await registration.pushManager.getSubscription()
      const vapidKey = await fetchVapidKey()
      const appKey = applicationServerKeyFromVapid(vapidKey)
      if (sub) {
        try {
          await sub.unsubscribe()
        } catch {
          // ignore existing subscription unsubscribe errors
        }
      }
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey as unknown as BufferSource,
      })

      const subJSON = sub.toJSON()
      if (!subJSON.endpoint || !subJSON.keys?.p256dh || !subJSON.keys?.auth) {
        throw new Error('Browser returned an incomplete push subscription')
      }

      await apiClient.post('/push/subscribe', {
        endpoint: subJSON.endpoint,
        p256dh: subJSON.keys.p256dh,
        auth: subJSON.keys.auth,
      })

      setState({
        supported: true,
        subscribed: true,
        permission: Notification.permission,
        registering: false,
        error: null,
        blockedReason: null,
      })
    } catch (err) {
      VAPID_KEY_CACHE.key = null
      try {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (existing) await existing.unsubscribe()
      } catch {
        // ignore cleanup failures
      }
      setState((s) => ({
        ...s,
        subscribed: false,
        registering: false,
        error: errorMessage(err),
        blockedReason: null,
      }))
    }
  }, [isAuthenticated])

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
    setState((s) => ({ ...s, subscribed: false, error: null }))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, register, unsubscribe }
}
