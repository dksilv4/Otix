export type {
  UpdateStatus,
  UpdateProgress,
  UpdateStatePayload,
  UpdateCheckResult,
} from '@/lib/desktop/api'

export interface AppUpdaterState {
  status: import('@/lib/desktop/api').UpdateStatus
  currentVersion: string
  availableVersion: string | null
  releaseNotes: string | null
  progress: import('@/lib/desktop/api').UpdateProgress | null
  error: string | null
  isChecking: boolean
  isDownloading: boolean
  isDownloaded: boolean
  isUpdateAvailable: boolean
  isDesktop: boolean
  isDismissed: boolean
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissNotification: () => void
}
