import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateModal } from '../components/update-modal'
import * as useAppUpdaterModule from '../hooks/use-app-updater'

describe('UpdateModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
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
      isModalOpen: false,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    const { container } = render(<UpdateModal isOpen={false} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders version comparison and triggers check for updates', () => {
    const checkForUpdatesMock = vi.fn()

    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
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
      isModalOpen: true,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: checkForUpdatesMock,
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateModal />)

    expect(screen.getByText('Software Update')).toBeDefined()
    expect(screen.getAllByText('v0.1.0').length).toBeGreaterThanOrEqual(1)

    const checkBtn = screen.getByRole('button', { name: /check for updates/i })
    fireEvent.click(checkBtn)
    expect(checkForUpdatesMock).toHaveBeenCalled()
  })

  it('renders release notes and allows downloading available update', () => {
    const downloadMock = vi.fn()

    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
      status: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: '- Added new updater modal\n- Improved performance',
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: true,
      isDesktop: true,
      isDismissed: false,
      isModalOpen: true,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: downloadMock,
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateModal />)

    expect(screen.getByText('New Update Available')).toBeDefined()
    expect(screen.getByText("What's New in v0.2.0")).toBeDefined()
    expect(screen.getByText('Added new updater modal')).toBeDefined()
    expect(screen.getByText('Improved performance')).toBeDefined()

    const downloadBtn = screen.getByRole('button', { name: /download update/i })
    fireEvent.click(downloadBtn)
    expect(downloadMock).toHaveBeenCalled()
  })

  it('renders download progress while downloading', () => {
    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
      status: 'downloading',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: null,
      progress: {
        percent: 64.5,
        bytesPerSecond: 2097152,
        transferred: 67108864,
        total: 104000000,
      },
      error: null,
      isChecking: false,
      isDownloading: true,
      isDownloaded: false,
      isUpdateAvailable: true,
      isDesktop: true,
      isDismissed: false,
      isModalOpen: true,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateModal />)

    expect(screen.getByText('Downloading Update')).toBeDefined()
    expect(screen.getByText('64.5%')).toBeDefined()
    expect(screen.getByText('2.0 MB/s')).toBeDefined()

    const bgBtn = screen.getByRole('button', { name: /run in background/i })
    expect(bgBtn).toBeDefined()
  })

  it('renders restart button and triggers installation when downloaded', () => {
    const installMock = vi.fn()

    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
      status: 'downloaded',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: true,
      isUpdateAvailable: true,
      isDesktop: true,
      isDismissed: false,
      isModalOpen: true,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: installMock,
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateModal />)

    expect(screen.getByText('Update Ready to Install')).toBeDefined()
    expect(screen.getByText('Update ready to install')).toBeDefined()

    const restartBtn = screen.getByRole('button', { name: /restart & install/i })
    fireEvent.click(restartBtn)
    expect(installMock).toHaveBeenCalled()
  })

  it('renders error state and triggers retry', () => {
    const checkMock = vi.fn()

    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
      status: 'error',
      currentVersion: '0.1.0',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: 'Network connection timed out',
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      isModalOpen: true,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: checkMock,
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateModal />)

    expect(screen.getByText('Update Error')).toBeDefined()
    expect(screen.getByText('Network connection timed out')).toBeDefined()

    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)
    expect(checkMock).toHaveBeenCalled()
  })
})
