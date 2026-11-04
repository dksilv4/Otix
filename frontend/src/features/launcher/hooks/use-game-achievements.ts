import { useState, useEffect, useCallback } from 'react'
import type { GameAchievement, AchievementStats, AchievementUnlockToast } from '../types'

export const useGameAchievements = (gameId?: string) => {
  const [achievements, setAchievements] = useState<GameAchievement[]>([])
  const [stats, setStats] = useState<AchievementStats>({
    total: 0,
    unlocked: 0,
    totalPoints: 0,
    earnedPoints: 0,
    completionPercentage: 0,
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAchievements = useCallback(async () => {
    if (!gameId || typeof window === 'undefined' || !window.desktopAPI?.getGameAchievements) {
      setAchievements([])
      setStats({ total: 0, unlocked: 0, totalPoints: 0, earnedPoints: 0, completionPercentage: 0 })
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [list, gameStats] = await Promise.all([
        window.desktopAPI.getGameAchievements(gameId),
        window.desktopAPI.getGameAchievementStats(gameId),
      ])
      setAchievements(list as GameAchievement[])
      setStats(gameStats)
    } catch (err: any) {
      setError(err?.message || 'Failed to load achievements')
    } finally {
      setLoading(false)
    }
  }, [gameId])

  const sync = useCallback(async () => {
    if (!gameId || typeof window === 'undefined' || !window.desktopAPI?.syncGameAchievements) {
      return
    }
    setLoading(true)
    try {
      await window.desktopAPI.syncGameAchievements(gameId)
      await fetchAchievements()
    } catch (err: any) {
      setError(err?.message || 'Failed to sync achievements')
    } finally {
      setLoading(false)
    }
  }, [gameId, fetchAchievements])

  useEffect(() => {
    fetchAchievements()
  }, [fetchAchievements])

  // Listen for real-time unlocks for this game
  useEffect(() => {
    if (!gameId || typeof window === 'undefined' || !window.desktopAPI?.onAchievementUnlocked) {
      return
    }

    const unsubscribe = window.desktopAPI.onAchievementUnlocked((unlocked) => {
      if (unlocked.gameId === gameId) {
        fetchAchievements()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [gameId, fetchAchievements])

  return {
    achievements,
    stats,
    loading,
    error,
    refresh: fetchAchievements,
    sync,
  }
}

export const useAchievementNotifications = () => {
  const [toasts, setToasts] = useState<AchievementUnlockToast[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.desktopAPI?.onAchievementUnlocked) {
      return
    }

    const unsubscribe = window.desktopAPI.onAchievementUnlocked((unlocked) => {
      const newToast: AchievementUnlockToast = {
        id: `${unlocked.gameId}:${unlocked.apiName}:${Date.now()}`,
        gameId: unlocked.gameId,
        gameTitle: unlocked.gameTitle,
        apiName: unlocked.apiName,
        displayName: unlocked.displayName,
        description: unlocked.description,
        iconUrl: unlocked.iconUrl,
        points: unlocked.points,
        unlockedAt: unlocked.unlockedAt,
        source: unlocked.source,
        rarityPercentage: unlocked.rarityPercentage,
      }

      setToasts((prev) => [...prev, newToast])

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        dismissToast(newToast.id)
      }, 6000)
    })

    return () => {
      unsubscribe()
    }
  }, [dismissToast])

  return {
    toasts,
    dismissToast,
  }
}
