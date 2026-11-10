import type { SyntheticEvent } from 'react'
import type { UpdateStatus, UpdateProgress } from '@/lib/desktop/api'
import { formatBytes, formatSpeed } from './updater-utils'

/**
 * Event handler that prevents default and stops propagation,
 * blocking any interaction with the loading screen or the app underneath.
 */
export const preventInteraction = (e: SyntheticEvent): void => {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * Format user-facing status message according to the current startup & updater phase.
 */
export const getLoadingStatusMessage = (
  updaterStatus: UpdateStatus,
  availableVersion?: string | null,
  isAuthLoading?: boolean,
  isInstalling?: boolean,
): string => {
  if (isInstalling) {
    return 'Update ready. Restarting Otix to apply…'
  }
  if (updaterStatus === 'downloading') {
    return availableVersion ? `Downloading update v${availableVersion}…` : 'Downloading update…'
  }
  if (updaterStatus === 'available') {
    return availableVersion ? `Found update v${availableVersion}. Preparing download…` : 'New update found. Preparing download…'
  }
  if (updaterStatus === 'downloaded') {
    return 'Update downloaded. Restarting Otix…'
  }
  if (updaterStatus === 'checking') {
    return 'Checking for updates…'
  }
  if (isAuthLoading) {
    return 'Loading your account…'
  }
  return 'Starting Otix…'
}

export interface FormattedProgress {
  percent: number
  transferredText: string
  speedText: string
}

/**
 * Formats live download progress into percentages, transferred bytes, and transfer speeds.
 */
export const formatTransferProgress = (progress: UpdateProgress | null): FormattedProgress => {
  if (!progress) {
    return {
      percent: 0,
      transferredText: '',
      speedText: '',
    }
  }

  const rawPercent = typeof progress.percent === 'number' ? progress.percent : 0
  const percent = Math.min(100, Math.max(0, Math.round(rawPercent)))

  const transferred = progress.transferred ? formatBytes(progress.transferred) : '0 B'
  const total = progress.total ? formatBytes(progress.total) : ''
  const transferredText = total ? `${transferred} / ${total}` : transferred

  const speedText = progress.bytesPerSecond ? formatSpeed(progress.bytesPerSecond) : ''

  return {
    percent,
    transferredText,
    speedText,
  }
}

/**
 * Seamlessly fades out and tears down the static HTML loading screen
 * created before React hydration.
 */
export const dismissInitialLoadingScreen = (): void => {
  if (typeof document === 'undefined') return
  const el = document.getElementById('app-loading-screen')
  if (!el) return
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  setTimeout(() => {
    try {
      el.remove()
    } catch {
      // ignore
    }
  }, 400)
}
