import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateNotificationToast } from '../components/update-notification-toast'
import * as useAppUpdaterModule from '../hooks/use-app-updater'

describe('UpdateNotificationToast', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when not desktop or not downloaded or dismissed', () => {
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
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    const { container } = render(<UpdateNotificationToast />)
    expect(container.firstChild).toBeNull()
  })

  it('renders toast when update is downloaded and handles restart action', () => {
    const installUpdateMock = vi.fn().mockResolvedValue(undefined)
    const dismissMock = vi.fn()

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
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: installUpdateMock,
      dismissNotification: dismissMock,
    })

    render(<UpdateNotificationToast />)

    expect(screen.getByText('Otix v0.2.0 Ready')).toBeDefined()
    expect(screen.getByText('Restart to apply the latest improvements and features.')).toBeDefined()

    const restartBtn = screen.getByRole('button', { name: /restart/i })
    fireEvent.click(restartBtn)
    expect(installUpdateMock).toHaveBeenCalled()

    const dismissBtn = screen.getByRole('button', { name: /dismiss update notification/i })
    fireEvent.click(dismissBtn)
    expect(dismissMock).toHaveBeenCalled()
  })

  it('triggers openUpdateModal when Details button is clicked', () => {
    const openModalMock = vi.fn()

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
      isModalOpen: false,
      autoCheck: true,
      autoDownload: true,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: openModalMock,
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateNotificationToast />)

    const detailsBtn = screen.getByRole('button', { name: /details/i })
    fireEvent.click(detailsBtn)
    expect(openModalMock).toHaveBeenCalled()
  })

  it('renders available state and allows triggering download', () => {
    const downloadMock = vi.fn().mockResolvedValue(undefined)

    vi.spyOn(useAppUpdaterModule, 'useAppUpdater').mockReturnValue({
      status: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: true,
      isDesktop: true,
      isDismissed: false,
      isModalOpen: false,
      autoCheck: true,
      autoDownload: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: downloadMock,
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
    })

    render(<UpdateNotificationToast />)

    expect(screen.getByText('Otix v0.2.0 Available')).toBeDefined()
    expect(screen.getByText('A newer version of Otix is ready to download.')).toBeDefined()

    const downloadBtn = screen.getByRole('button', { name: /download/i })
    fireEvent.click(downloadBtn)
    expect(downloadMock).toHaveBeenCalled()
  })
})
