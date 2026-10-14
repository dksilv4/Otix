import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  hasSeenSetupWizard,
  markOnboardingFinished,
  checkLocalNode,
  claimNodeWithPin,
  selectLocalGameDirectory,
  saveLibraryScanDirectory,
  SETUP_WIZARD_SEEN_KEY,
} from '../utils/setup-wizard-utils'
import { apiClient } from '@/lib/api/client'
import * as pendingNodes from '@/features/downloads/pending-nodes'
import * as desktopApi from '@/lib/desktop/api'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('@ui/atoms/xp-toast-dispatcher', () => ({
  addXPToast: vi.fn(),
}))

describe('setup-wizard-utils', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('hasSeenSetupWizard', () => {
    it('returns true if onboardingCompleted is true', () => {
      expect(hasSeenSetupWizard(true)).toBe(true)
    })

    it('returns true if localStorage key is true', () => {
      localStorage.setItem(SETUP_WIZARD_SEEN_KEY, 'true')
      expect(hasSeenSetupWizard(false)).toBe(true)
    })

    it('returns false when onboardingCompleted is false/undefined and key is unset', () => {
      expect(hasSeenSetupWizard(false)).toBe(false)
      expect(hasSeenSetupWizard(undefined)).toBe(false)
    })
  })

  describe('markOnboardingFinished', () => {
    it('writes to localStorage and patches user if authenticated', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: {} } as any)
      await markOnboardingFinished(true)

      expect(localStorage.getItem(SETUP_WIZARD_SEEN_KEY)).toBe('true')
      expect(apiClient.patch).toHaveBeenCalledWith('/auth/me', { onboardingCompleted: true })
    })

    it('writes to localStorage and skips patch if not authenticated', async () => {
      await markOnboardingFinished(false)

      expect(localStorage.getItem(SETUP_WIZARD_SEEN_KEY)).toBe('true')
      expect(apiClient.patch).not.toHaveBeenCalled()
    })
  })

  describe('checkLocalNode', () => {
    it('delegates to probeLocalGameNode', async () => {
      const probeSpy = vi.spyOn(pendingNodes, 'probeLocalGameNode').mockResolvedValueOnce({
        serverName: 'Test Node',
        localUrl: 'http://127.0.0.1:8090',
        claimCode: '123456',
        claimed: false,
      })

      const res = await checkLocalNode()
      expect(probeSpy).toHaveBeenCalled()
      expect(res?.serverName).toBe('Test Node')
      expect(res?.claimCode).toBe('123456')
    })
  })

  describe('claimNodeWithPin', () => {
    it('calls /downloads/servers/claim with formatted body', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { message: 'Node claimed successfully' },
      } as any)

      const result = await claimNodeWithPin('http://127.0.0.1:8090', '7X9K2P', 'My Gaming Rig')
      expect(result.success).toBe(true)
      expect(result.message).toBe('Node claimed successfully')
      expect(apiClient.post).toHaveBeenCalledWith('/downloads/servers/claim', {
        nodeUrl: 'http://127.0.0.1:8090',
        claimPin: '7X9K2P',
        name: 'My Gaming Rig',
      })
    })

    it('handles claim error responses gracefully', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        response: { data: { detail: 'Invalid PIN' } },
      })

      const result = await claimNodeWithPin('http://127.0.0.1:8090', 'WRONG')
      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid PIN')
    })
  })

  describe('selectLocalGameDirectory & saveLibraryScanDirectory', () => {
    it('selects folder via desktopAPI if available', async () => {
      const selectDirectory = vi.fn().mockResolvedValue('/Games/Steam')
      vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue({ selectDirectory } as any)

      const path = await selectLocalGameDirectory()
      expect(path).toBe('/Games/Steam')
      expect(selectDirectory).toHaveBeenCalled()
    })

    it('returns null if desktopAPI is not available', async () => {
      vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue(null)
      const path = await selectLocalGameDirectory()
      expect(path).toBeNull()
    })

    it('saves scan directory in desktop settings', async () => {
      const setDesktopSettings = vi.fn().mockResolvedValue({})
      const getScanPaths = vi.fn().mockResolvedValue(['/Old/Games'])
      const saveScanPaths = vi.fn().mockResolvedValue(undefined)
      const scanPaths = vi.fn().mockResolvedValue(undefined)

      vi.spyOn(desktopApi, 'getDesktopAPI').mockReturnValue({
        setDesktopSettings,
        getScanPaths,
        saveScanPaths,
        scanPaths,
      } as any)

      const saved = await saveLibraryScanDirectory('/New/Games')
      expect(saved).toBe(true)
      expect(setDesktopSettings).toHaveBeenCalledWith({ gamesInstallPath: '/New/Games' })
      expect(saveScanPaths).toHaveBeenCalledWith(['/Old/Games', '/New/Games'])
    })
  })
})
