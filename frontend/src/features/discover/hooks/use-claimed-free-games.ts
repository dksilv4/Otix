import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { showToast } from '@ui/molecules/toast'
import { libraryKeys } from '@library/library-keys'
import { discoverKeys } from '@/features/discover/queries/discover-keys'
import type { FreeGameItem } from '@/features/discover/queries/discover-queries'
import {
  CLAIMED_FREE_GAMES_STORAGE_KEY,
  CLAIMED_FREE_GAMES_CHANGED_EVENT,
  HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY,
  HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT,
  getFreeGameClaimKey,
  readClaimedFreeGames,
  writeClaimedFreeGames,
  readHideClaimedPreference,
  writeHideClaimedPreference,
} from '../utils/free-games'

export const useClaimedFreeGames = () => {
  const queryClient = useQueryClient()
  const [claimedKeys, setClaimedKeys] = useState<string[]>(readClaimedFreeGames)
  const [unclaimedKeys, setUnclaimedKeys] = useState<Set<string>>(() => new Set())
  const [hideClaimed, setHideClaimedState] = useState<boolean>(readHideClaimedPreference)

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CLAIMED_FREE_GAMES_STORAGE_KEY) {
        setClaimedKeys(readClaimedFreeGames())
      } else if (event.key === HIDE_CLAIMED_FREE_GAMES_STORAGE_KEY) {
        setHideClaimedState(readHideClaimedPreference())
      }
    }

    const handleClaimedCustomEvent = () => {
      setClaimedKeys(readClaimedFreeGames())
    }

    const handleHideCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ hide: boolean }>
      if (customEvent.detail && typeof customEvent.detail.hide === 'boolean') {
        setHideClaimedState(customEvent.detail.hide)
      } else {
        setHideClaimedState(readHideClaimedPreference())
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(CLAIMED_FREE_GAMES_CHANGED_EVENT, handleClaimedCustomEvent)
    window.addEventListener(HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT, handleHideCustomEvent)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(CLAIMED_FREE_GAMES_CHANGED_EVENT, handleClaimedCustomEvent)
      window.removeEventListener(HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT, handleHideCustomEvent)
    }
  }, [])

  const isClaimed = useCallback(
    (item: FreeGameItem): boolean => {
      const key = getFreeGameClaimKey(item)
      if (claimedKeys.includes(key)) return true
      if (unclaimedKeys.has(key)) return false
      if (item.mediaItem?.userInteractions?.owned) return true
      return false
    },
    [claimedKeys, unclaimedKeys],
  )

  const toggleClaimed = useCallback(
    async (item: FreeGameItem): Promise<boolean> => {
      const key = getFreeGameClaimKey(item)
      const currentlyClaimed = isClaimed(item)

      if (currentlyClaimed) {
        const stored = readClaimedFreeGames()
        const next = stored.filter((k) => k !== key)
        writeClaimedFreeGames(next)
        setClaimedKeys(next)
        setUnclaimedKeys((prev) => {
          const s = new Set(prev)
          s.add(key)
          return s
        })
        window.dispatchEvent(
          new CustomEvent(CLAIMED_FREE_GAMES_CHANGED_EVENT, { detail: { key, claimed: false } }),
        )

        if (item.mediaItem?.id) {
          try {
            await apiClient.delete(`/media/${item.mediaItem.id}/claim`)
            queryClient.invalidateQueries({ queryKey: libraryKeys.tab('owned') })
            queryClient.invalidateQueries({ queryKey: discoverKeys.freeGames() })
          } catch {
            // Ignore failure for guests or network blips
          }
        }

        showToast({
          title: 'Marked as unclaimed',
          description: `"${item.title}" marked as unclaimed.`,
          variant: 'info',
        })
        return false
      } else {
        const stored = readClaimedFreeGames()
        const next = Array.from(new Set([...stored, key]))
        writeClaimedFreeGames(next)
        setClaimedKeys(next)
        setUnclaimedKeys((prev) => {
          const s = new Set(prev)
          s.delete(key)
          return s
        })
        window.dispatchEvent(
          new CustomEvent(CLAIMED_FREE_GAMES_CHANGED_EVENT, { detail: { key, claimed: true } }),
        )

        if (item.mediaItem?.id) {
          try {
            await apiClient.post(`/media/${item.mediaItem.id}/claim`)
            queryClient.invalidateQueries({ queryKey: libraryKeys.tab('owned') })
            queryClient.invalidateQueries({ queryKey: discoverKeys.freeGames() })
          } catch {
            // Ignore failure for guests or network blips
          }
        }

        showToast({
          title: 'Marked as claimed',
          description: `"${item.title}" marked as claimed.`,
          variant: 'success',
        })
        return true
      }
    },
    [isClaimed, queryClient],
  )

  const setHideClaimed = useCallback(
    (valOrUpdater: boolean | ((prev: boolean) => boolean)) => {
      setHideClaimedState((prev) => {
        const next = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater
        writeHideClaimedPreference(next)
        window.dispatchEvent(
          new CustomEvent(HIDE_CLAIMED_FREE_GAMES_CHANGED_EVENT, { detail: { hide: next } }),
        )
        return next
      })
    },
    [],
  )

  return {
    claimedKeys,
    isClaimed,
    toggleClaimed,
    hideClaimed,
    setHideClaimed,
  }
}
