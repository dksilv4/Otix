import { useState, useEffect, useCallback } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import {
  type MatchingProgressData,
  initialMatchingProgress,
  cancelDesktopMatching,
  startDesktopMatching,
} from '../utils/matching-progress'

export const useMatchingProgress = () => {
  const [progressData, setProgressData] = useState<MatchingProgressData>(initialMatchingProgress)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = getDesktopAPI() ?? (window as any).desktopAPI
    if (!api) return

    // Query initial status if supported
    if (api.getMatchingStatus) {
      api.getMatchingStatus().then((res: any) => {
        if (res && typeof res === 'object') {
          setProgressData((prev) => ({
            ...prev,
            isMatching: Boolean(res.isMatching),
            status: res.isMatching ? 'running' : prev.status,
            processed: typeof res.processed === 'number' ? res.processed : prev.processed,
            total: typeof res.total === 'number' ? res.total : prev.total,
            percent: typeof res.percent === 'number' ? res.percent : prev.percent,
            matchedCount: typeof res.matched === 'number' ? res.matched : prev.matchedCount,
          }))
        }
      }).catch(() => {})
    }

    const unsubProgress = api.onMatchingProgress?.((data: any) => {
      if (!data) return

      const isRunning = data.state === 'running' || data.status === 'processing'
      const isComplete = data.state === 'completed' || data.status === 'completed'
      const isCancelled = data.state === 'cancelled' || data.status === 'cancelled'
      const isFailed = data.state === 'failed' || data.status === 'failed'

      const currentItem = data.queryTitle || data.currentItem || data.query_title || ''
      const matchData = data.match || data.auto_match
      const posterUrl = matchData?.poster_url || matchData?.posterUrl || data.posterUrl || null
      const confidence = matchData?.confidence ?? data.confidence ?? null

      const processed = typeof data.processed === 'number'
        ? data.processed
        : typeof data.current === 'number'
          ? data.current
          : 0
      const total = typeof data.total === 'number'
        ? data.total
        : typeof data.totalGames === 'number'
          ? data.totalGames
          : 0
      const percent = typeof data.percent === 'number'
        ? data.percent
        : typeof data.progress === 'number'
          ? data.progress
          : total > 0
            ? Math.round((processed / total) * 100)
            : 0

      setProgressData((prev) => ({
        ...prev,
        isMatching: isRunning,
        status: isRunning
          ? 'running'
          : isComplete
            ? 'completed'
            : isCancelled
              ? 'cancelled'
              : isFailed
                ? 'error'
                : prev.status,
        processed,
        total,
        percent,
        matchedCount: typeof data.matched === 'number' ? data.matched : prev.matchedCount,
        currentItem: currentItem || prev.currentItem,
        currentPosterUrl: posterUrl ?? prev.currentPosterUrl,
        confidence,
        error: data.error || null,
      }))
    })

    const unsubComplete = api.onMatchingComplete?.((data: any) => {
      setProgressData((prev) => ({
        ...prev,
        isMatching: false,
        status: 'completed',
        percent: 100,
        matchedCount: typeof data?.matched === 'number' ? data.matched : prev.matchedCount,
        error: null,
      }))
    })

    const unsubCancelled = api.onMatchingCancelled?.(() => {
      setProgressData((prev) => ({
        ...prev,
        isMatching: false,
        status: 'cancelled',
      }))
    })

    return () => {
      unsubProgress?.()
      unsubComplete?.()
      unsubCancelled?.()
    }
  }, [])

  const handleCancel = useCallback(async () => {
    await cancelDesktopMatching()
    setProgressData((prev) => ({
      ...prev,
      isMatching: false,
      status: 'cancelled',
    }))
  }, [])

  const handleStart = useCallback(async (options?: { forceAll?: boolean; rematchAll?: boolean }) => {
    setProgressData((prev) => ({
      ...prev,
      isMatching: true,
      status: 'running',
      percent: 0,
      processed: 0,
      error: null,
    }))
    await startDesktopMatching(options)
  }, [])

  return {
    ...progressData,
    cancelMatching: handleCancel,
    startMatching: handleStart,
  }
}
