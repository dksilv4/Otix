import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsGeneralPage } from '../pages/settings-general-page'
import * as updaterModule from '@/features/updater'

vi.mock('@/lib/desktop/api', () => ({
  isDesktop: vi.fn().mockReturnValue(true),
  getDesktopAPI: vi.fn().mockReturnValue(null),
}))

vi.mock('@/features/welcome', () => ({
  useWelcomePreferences: () => ({
    isWelcomeNavVisible: true,
    isWelcomeBannerVisible: true,
    setWelcomeNavVisible: vi.fn(),
    setWelcomeBannerVisible: vi.fn(),
  }),
  SetupWizardModal: () => null,
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: vi.fn(),
}))

describe('SettingsGeneralPage - About & Updates', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders installed version and updater section in desktop mode', () => {
    const checkForUpdatesMock = vi.fn()

    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.0',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: checkForUpdatesMock,
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    render(<SettingsGeneralPage />)

    expect(screen.getByText('About & Updates')).toBeDefined()
    expect(screen.getByText('v0.1.0')).toBeDefined()
    expect(screen.getByText('Up to date')).toBeDefined()

    const checkBtn = screen.getByRole('button', { name: /check for updates/i })
    expect(checkBtn).toBeDefined()
    fireEvent.click(checkBtn)
    expect(checkForUpdatesMock).toHaveBeenCalled()
  })

  it('renders restart button when update is downloaded', () => {
    const installUpdateMock = vi.fn()

    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'downloaded',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: 'Performance improvements and bug fixes',
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: true,
      isUpdateAvailable: true,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: installUpdateMock,
      dismissNotification: vi.fn(),
    })

    render(<SettingsGeneralPage />)

    expect(screen.getByText('Version v0.2.0 ready to install')).toBeDefined()
    expect(screen.getByText('Performance improvements and bug fixes')).toBeDefined()

    const restartBtn = screen.getByRole('button', { name: /restart & install/i })
    fireEvent.click(restartBtn)
    expect(installUpdateMock).toHaveBeenCalled()
  })
})
