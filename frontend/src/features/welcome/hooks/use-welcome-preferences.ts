import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { apiClient } from '@/lib/api/client'
import {
  readWelcomeNavPreference,
  writeWelcomeNavPreference,
  readWelcomeBannerPreference,
  writeWelcomeBannerPreference,
  WELCOME_NAV_STORAGE_KEY,
  WELCOME_BANNER_STORAGE_KEY,
} from '../utils/welcome-preferences'

export const useWelcomePreferences = () => {
  const { user, isAuthenticated, refreshUser } = useAuth()
  const onboardingCompleted = user?.onboardingCompleted

  const [isWelcomeNavVisible, setIsWelcomeNavVisibleState] = useState(() =>
    readWelcomeNavPreference(onboardingCompleted),
  )

  const [isWelcomeBannerVisible, setIsWelcomeBannerVisibleState] = useState(() =>
    readWelcomeBannerPreference(onboardingCompleted),
  )

  // Sync state if user onboarding state loads or changes
  useEffect(() => {
    setIsWelcomeNavVisibleState(readWelcomeNavPreference(onboardingCompleted))
    setIsWelcomeBannerVisibleState(readWelcomeBannerPreference(onboardingCompleted))
  }, [onboardingCompleted])

  // Listen to cross-tab storage events or updates within the session
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === WELCOME_NAV_STORAGE_KEY) {
        setIsWelcomeNavVisibleState(readWelcomeNavPreference(onboardingCompleted))
      }
      if (e.key === WELCOME_BANNER_STORAGE_KEY) {
        setIsWelcomeBannerVisibleState(readWelcomeBannerPreference(onboardingCompleted))
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [onboardingCompleted])

  const setWelcomeNavVisible = useCallback((visible: boolean) => {
    writeWelcomeNavPreference(visible)
    setIsWelcomeNavVisibleState(visible)
  }, [])

  const setWelcomeBannerVisible = useCallback((visible: boolean) => {
    writeWelcomeBannerPreference(visible)
    setIsWelcomeBannerVisibleState(visible)
  }, [])

  const hideWelcomeCompletely = useCallback(async () => {
    writeWelcomeNavPreference(false)
    writeWelcomeBannerPreference(false)
    setIsWelcomeNavVisibleState(false)
    setIsWelcomeBannerVisibleState(false)

    if (isAuthenticated) {
      try {
        await apiClient.patch('/auth/me', { onboardingCompleted: true })
        void refreshUser()
      } catch {
        // ignore offline / network error
      }
    }
  }, [isAuthenticated, refreshUser])

  const resetWelcome = useCallback(async () => {
    writeWelcomeNavPreference(true)
    writeWelcomeBannerPreference(true)
    setIsWelcomeNavVisibleState(true)
    setIsWelcomeBannerVisibleState(true)

    if (isAuthenticated) {
      try {
        await apiClient.patch('/auth/me', { onboardingCompleted: false })
        void refreshUser()
      } catch {
        // ignore offline / network error
      }
    }
  }, [isAuthenticated, refreshUser])

  return {
    isWelcomeNavVisible,
    isWelcomeBannerVisible,
    setWelcomeNavVisible,
    setWelcomeBannerVisible,
    hideWelcomeCompletely,
    resetWelcome,
  }
}
