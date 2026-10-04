import { useState, useEffect, useCallback } from 'react'

export const STEAM_FREE_PACKS_STORAGE_KEY = 'otix:show-steam-free-packs'
export const STEAM_FREE_PACKS_CHANGED_EVENT = 'otix:steam-free-packs-changed'

function readSetting(): boolean {
  try {
    return localStorage.getItem(STEAM_FREE_PACKS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Hook to read and update the preference for showing free Steam packs / DLCs / bundles.
 * Defaults to false (disabled).
 */
export function useSteamFreePacksSetting() {
  const [showSteamPacks, setShowSteamPacksState] = useState<boolean>(readSetting)

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STEAM_FREE_PACKS_STORAGE_KEY) {
        setShowSteamPacksState(event.newValue === 'true')
      }
    }

    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled: boolean }>
      setShowSteamPacksState(Boolean(customEvent.detail?.enabled))
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(STEAM_FREE_PACKS_CHANGED_EVENT, handleCustomEvent)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(STEAM_FREE_PACKS_CHANGED_EVENT, handleCustomEvent)
    }
  }, [])

  const setShowSteamPacks = useCallback((valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
    setShowSteamPacksState((prev) => {
      const next = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater
      try {
        localStorage.setItem(STEAM_FREE_PACKS_STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent(STEAM_FREE_PACKS_CHANGED_EVENT, { detail: { enabled: next } }),
      )
      return next
    })
  }, [])

  return [showSteamPacks, setShowSteamPacks] as const
}
