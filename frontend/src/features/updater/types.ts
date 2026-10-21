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
  isModalOpen: boolean
  autoCheck: boolean
  autoDownload: boolean
  allowPrerelease: boolean
  githubToken: string
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissNotification: () => void
  openUpdateModal: () => void
  closeUpdateModal: () => void
  setAutoCheck: (enabled: boolean) => void
  setAutoDownload: (enabled: boolean) => void
  setAllowPrerelease: (enabled: boolean) => void
  setGithubToken: (token: string) => Promise<void>
  validateToken: (token?: string) => Promise<{ valid: boolean; repo?: string; error?: string }>
}
