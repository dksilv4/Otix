import { useEffect, useRef } from 'react'
import { useOptionalAuth } from '@auth/hooks/use-auth'
import type { User } from '@auth/types'
import { isDesktop } from '@/lib/desktop/api'
import {
  registerDeviceSession,
  fetchDevicePendingUpdates,
  acknowledgeDeviceUpdates,
} from '../utils/device-registration'

export const useDeviceSync = (userOverride?: User | null, isAuthenticatedOverride?: boolean) => {
  const optionalAuth = useOptionalAuth()
  const user = userOverride !== undefined ? userOverride : (optionalAuth?.user ?? null)
  const isAuthenticated =
    isAuthenticatedOverride !== undefined ? isAuthenticatedOverride : (optionalAuth?.isAuthenticated ?? !!user)
  const registeredNodeIdRef = useRef<number | null>(null)

  useEffect(() => {
    // Browser sessions should not be nodes. Only desktop client sessions should sync.
    if (!isDesktop() || !isAuthenticated || !user) return

    let cancelled = false

    const handleSync = async () => {
      const response = await registerDeviceSession(true)
      if (cancelled || !response) return

      if (response.id != null) {
        registeredNodeIdRef.current = response.id
      }

      // Check if there are queued updates
      const pending = response.pendingUpdates || (response.id ? await fetchDevicePendingUpdates(response.id) : [])
      if (pending && pending.length > 0 && response.id != null) {
        const updateIds: string[] = []
        for (const update of pending) {
          updateIds.push(update.id)
          // If desktop settings update, notify desktop API if available
          const apiAny = window.desktopAPI as any
          if (update.type === 'desktop_settings' && apiAny?.settings?.save) {
            try {
              apiAny.settings.save(update.data)
            } catch {
              // ignore
            }
          }
        }
        await acknowledgeDeviceUpdates(response.id, updateIds)
      }
    }

    void handleSync()

    const onOnline = () => {
      void handleSync()
    }

    const onOffline = () => {
      if (registeredNodeIdRef.current != null) {
        void registerDeviceSession(false)
      }
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [isAuthenticated, user])
}
