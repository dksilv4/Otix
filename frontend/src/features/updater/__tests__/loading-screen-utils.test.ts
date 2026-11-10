import { describe, it, expect, vi } from 'vitest'
import {
  preventInteraction,
  getLoadingStatusMessage,
  formatTransferProgress,
  dismissInitialLoadingScreen,
} from '../utils/loading-screen-utils'

describe('loading-screen-utils', () => {
  describe('preventInteraction', () => {
    it('calls preventDefault and stopPropagation on the event', () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
      preventInteraction(event as any)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
      expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    })
  })

  describe('getLoadingStatusMessage', () => {
    it('returns installing message when isInstalling is true', () => {
      expect(getLoadingStatusMessage('downloaded', '1.2.0', false, true)).toBe(
        'Update ready. Restarting Otix to apply…',
      )
    })

    it('returns downloading message with version when downloading', () => {
      expect(getLoadingStatusMessage('downloading', '2.0.0', false, false)).toBe(
        'Downloading update v2.0.0…',
      )
      expect(getLoadingStatusMessage('downloading', null, false, false)).toBe(
        'Downloading update…',
      )
    })

    it('returns available message when update found', () => {
      expect(getLoadingStatusMessage('available', '1.1.0', false, false)).toBe(
        'Found update v1.1.0. Preparing download…',
      )
      expect(getLoadingStatusMessage('available', undefined, false, false)).toBe(
        'New update found. Preparing download…',
      )
    })

    it('returns downloaded message when download finishes', () => {
      expect(getLoadingStatusMessage('downloaded', '1.2.0', false, false)).toBe(
        'Update downloaded. Restarting Otix…',
      )
    })

    it('returns checking message when checking for updates', () => {
      expect(getLoadingStatusMessage('checking', null, false, false)).toBe(
        'Checking for updates…',
      )
    })

    it('returns account loading message when auth is loading', () => {
      expect(getLoadingStatusMessage('idle', null, true, false)).toBe(
        'Loading your account…',
      )
    })

    it('defaults to Starting Otix…', () => {
      expect(getLoadingStatusMessage('idle', null, false, false)).toBe(
        'Starting Otix…',
      )
      expect(getLoadingStatusMessage('not-available', null, false, false)).toBe(
        'Starting Otix…',
      )
    })
  })

  describe('formatTransferProgress', () => {
    it('handles null progress', () => {
      const result = formatTransferProgress(null)
      expect(result).toEqual({
        percent: 0,
        transferredText: '',
        speedText: '',
      })
    })

    it('formats normal progress correctly', () => {
      const result = formatTransferProgress({
        percent: 45.4,
        bytesPerSecond: 1024 * 1024 * 2.5,
        transferred: 1024 * 1024 * 45,
        total: 1024 * 1024 * 100,
      })
      expect(result.percent).toBe(45)
      expect(result.transferredText).toBe('45.0 MB / 100.0 MB')
      expect(result.speedText).toBe('2.5 MB/s')
    })

    it('clamps percent between 0 and 100', () => {
      expect(formatTransferProgress({ percent: 150, bytesPerSecond: 0, transferred: 0, total: 0 }).percent).toBe(100)
      expect(formatTransferProgress({ percent: -10, bytesPerSecond: 0, transferred: 0, total: 0 }).percent).toBe(0)
    })
  })

  describe('dismissInitialLoadingScreen', () => {
    it('safely fades out and removes element from DOM', () => {
      vi.useFakeTimers()
      const div = document.createElement('div')
      div.id = 'app-loading-screen'
      document.body.appendChild(div)

      dismissInitialLoadingScreen()
      expect(div.style.opacity).toBe('0')
      expect(div.style.pointerEvents).toBe('none')

      vi.advanceTimersByTime(500)
      expect(document.getElementById('app-loading-screen')).toBeNull()
      vi.useRealTimers()
    })
  })
})
