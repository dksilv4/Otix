import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FEATURE_TIPS } from '../constants/feature-tips'
import type { FeatureTip } from '../types'
import {
  readSpotlightPreferences,
  writeSpotlightPreferences,
  markTipAsSeen,
  resetSeenTips,
  getNextTip,
  getPreviousTip,
  getRandomTip,
} from '../utils/spotlight-storage'
import { openDecideWatch } from '@/features/discover/open-decide-watch'
import { openCommandPalette } from '@/features/hub/open-command-palette'

export interface UseFeatureSpotlightOptions {
  initialTipId?: string
  markSeenOnMount?: boolean
}

export const useFeatureSpotlight = (options: UseFeatureSpotlightOptions = {}) => {
  const { initialTipId, markSeenOnMount = true } = options
  const navigate = useNavigate()

  const [preferences, setPreferences] = useState(() => readSpotlightPreferences())

  const [currentTip, setCurrentTip] = useState<FeatureTip>(() => {
    if (initialTipId) {
      const match = FEATURE_TIPS.find((t) => t.id === initialTipId)
      if (match) return match
    }
    return getNextTip()
  })

  useEffect(() => {
    if (markSeenOnMount && currentTip) {
      markTipAsSeen(currentTip.id)
      setPreferences(readSpotlightPreferences())
    }
  }, [currentTip, markSeenOnMount])

  const goToNext = useCallback(() => {
    const next = getNextTip(currentTip.id)
    setCurrentTip(next)
    markTipAsSeen(next.id)
    setPreferences(readSpotlightPreferences())
  }, [currentTip.id])

  const goToPrevious = useCallback(() => {
    const prev = getPreviousTip(currentTip.id)
    setCurrentTip(prev)
    markTipAsSeen(prev.id)
    setPreferences(readSpotlightPreferences())
  }, [currentTip.id])

  const goToRandom = useCallback(() => {
    const random = getRandomTip(currentTip.id)
    setCurrentTip(random)
    markTipAsSeen(random.id)
    setPreferences(readSpotlightPreferences())
  }, [currentTip.id])

  const selectTip = useCallback((tipId: string) => {
    const match = FEATURE_TIPS.find((t) => t.id === tipId)
    if (match) {
      setCurrentTip(match)
      markTipAsSeen(match.id)
      setPreferences(readSpotlightPreferences())
    }
  }, [])

  const setAutoEnabled = useCallback((enabled: boolean) => {
    const updated = writeSpotlightPreferences({ enabled })
    setPreferences(updated)
  }, [])

  const toggleAutoEnabled = useCallback(() => {
    setPreferences((prev) => {
      const next = !prev.enabled
      return writeSpotlightPreferences({ enabled: next })
    })
  }, [])

  const resetSeen = useCallback(() => {
    resetSeenTips()
    setPreferences(readSpotlightPreferences())
  }, [])

  const executeAction = useCallback(
    (tip: FeatureTip, onClose?: () => void) => {
      onClose?.()
      if (tip.actionType === 'navigate') {
        void navigate({ to: tip.actionPayload as any })
      } else if (tip.actionType === 'command') {
        if (tip.actionPayload === 'decide-watch') {
          openDecideWatch()
        } else if (tip.actionPayload === 'command-palette') {
          openCommandPalette()
        } else if (tip.actionPayload === 'open-user-menu') {
          void navigate({ to: '/settings/profile' })
        }
      }
    },
    [navigate],
  )

  const currentIndex = FEATURE_TIPS.findIndex((t) => t.id === currentTip.id)
  const isSeen = preferences.seenTipIds.includes(currentTip.id)

  return {
    currentTip,
    currentIndex: currentIndex === -1 ? 0 : currentIndex,
    totalTips: FEATURE_TIPS.length,
    isAutoEnabled: preferences.enabled,
    seenTipIds: preferences.seenTipIds,
    seenCount: preferences.seenTipIds.length,
    isCurrentTipSeen: isSeen,
    goToNext,
    goToPrevious,
    goToRandom,
    selectTip,
    setAutoEnabled,
    toggleAutoEnabled,
    resetSeen,
    executeAction,
  }
}
