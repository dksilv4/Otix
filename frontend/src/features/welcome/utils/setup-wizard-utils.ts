import { probeLocalGameNode, type PendingNode } from '@/features/downloads/pending-nodes'
import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { addXPToast } from '@ui/atoms/xp-toast-dispatcher'

export const SETUP_WIZARD_SEEN_KEY = 'otix:setup-wizard-completed'

export interface SetupWizardState {
  mode: 'desktop' | 'node' | 'cloud'
  node: PendingNode | null
  claimPin: string
  gamePath: string | null
  telemetryEnabled: boolean
  freeGamesAlerts: boolean
}

export const checkLocalNode = async (): Promise<PendingNode | null> => {
  return await probeLocalGameNode()
}

export const claimNodeWithPin = async (
  nodeUrl: string,
  pin: string,
  serverName?: string,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const resp = await apiClient.post('/downloads/servers/claim', {
      nodeUrl,
      claimPin: pin,
      name: serverName || 'Local Otix Node',
    })
    return { success: true, message: (resp.data as { message?: string })?.message }
  } catch (err: unknown) {
    const errorMsg =
      (err as { response?: { data?: { detail?: string; error?: string } } })?.response?.data?.detail ||
      (err as { message?: string })?.message ||
      'Failed to claim Otix Node. Check PIN and try again.'
    return { success: false, message: errorMsg }
  }
}

export const selectLocalGameDirectory = async (): Promise<string | null> => {
  const desktop = getDesktopAPI()
  if (desktop?.selectDirectory) {
    try {
      const selected = await desktop.selectDirectory()
      return selected || null
    } catch {
      return null
    }
  }
  return null
}

export const saveLibraryScanDirectory = async (folderPath: string): Promise<boolean> => {
  const desktop = getDesktopAPI()
  if (!desktop) return false
  try {
    if (desktop.setDesktopSettings) {
      await desktop.setDesktopSettings({ gamesInstallPath: folderPath })
    }
    const api = desktop as unknown as {
      getScanPaths?: () => Promise<string[]>
      saveScanPaths?: (paths: string[]) => Promise<void>
      scanPaths?: (paths?: string[]) => Promise<unknown>
    }
    if (api.getScanPaths && api.saveScanPaths) {
      const existing = (await api.getScanPaths()) || []
      if (!existing.includes(folderPath)) {
        await api.saveScanPaths([...existing, folderPath])
      }
    }
    if (api.scanPaths) {
      void api.scanPaths([folderPath])
    }
    return true
  } catch {
    return false
  }
}

export const markOnboardingFinished = async (isAuthenticated: boolean): Promise<void> => {
  try {
    localStorage.setItem(SETUP_WIZARD_SEEN_KEY, 'true')
  } catch {
    // ignore
  }

  if (isAuthenticated) {
    try {
      await apiClient.patch('/auth/me', { onboardingCompleted: true })
    } catch {
      // ignore
    }
  }

  // Trigger celebration XP toast
  try {
    addXPToast(150, { reason: 'Welcome to Otix! First-run setup completed' })
  } catch {
    // ignore
  }
}

export const hasSeenSetupWizard = (onboardingCompleted?: boolean): boolean => {
  if (onboardingCompleted === true) return true
  try {
    return localStorage.getItem(SETUP_WIZARD_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}
