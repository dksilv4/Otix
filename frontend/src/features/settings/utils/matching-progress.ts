import { getDesktopAPI } from '@/lib/desktop/api'

export interface MatchingProgressData {
  isMatching: boolean
  processed: number
  total: number
  percent: number
  matchedCount: number
  currentItem: string
  currentPosterUrl?: string | null
  confidence?: number | null
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
  error?: string | null
}

export const initialMatchingProgress: MatchingProgressData = {
  isMatching: false,
  processed: 0,
  total: 0,
  percent: 0,
  matchedCount: 0,
  currentItem: '',
  currentPosterUrl: null,
  confidence: null,
  status: 'idle',
  error: null,
}

export const formatMatchingPercent = (percent: number): string => {
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`
}

export const formatMatchingRatio = (processed: number, total: number): string => {
  if (total <= 0) return `${processed} processed`
  return `${processed} of ${total}`
}

export const getMatchingStatusLabel = (data: MatchingProgressData): string => {
  if (data.status === 'completed') {
    return `Matching complete (${data.matchedCount} matched)`
  }
  if (data.status === 'cancelled') {
    return 'Matching cancelled'
  }
  if (data.status === 'error') {
    return data.error || 'Matching error'
  }
  if (data.isMatching) {
    if (data.currentItem) {
      return `Matching: ${data.currentItem}`
    }
    return 'Matching games against Otix catalog…'
  }
  return 'Ready to match'
}

export const cancelDesktopMatching = async (): Promise<void> => {
  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.cancelMatching) {
    await api.cancelMatching()
  }
}

export const startDesktopMatching = async (options?: { forceAll?: boolean; rematchAll?: boolean }): Promise<void> => {
  const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
  if (api?.startMatching) {
    await api.startMatching({
      ...options,
      rematchAll: options?.rematchAll ?? options?.forceAll ?? false,
    })
  }
}
