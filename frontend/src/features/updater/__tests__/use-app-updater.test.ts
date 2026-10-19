import { renderHook, act, waitFor } from '@testing-library/react'
import { useAppUpdater } from '../hooks/use-app-updater'
import { clearDesktopAPICache } from '@/lib/desktop/api'

describe('useAppUpdater', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearDesktopAPICache()
    delete (window as any).desktopAPI
  })

  afterEach(() => {
    clearDesktopAPICache()
    delete (window as any).desktopAPI
  })

  it('provides safe defaults when running in web mode', () => {
    const { result } = renderHook(() => useAppUpdater())

    expect(result.current.isDesktop).toBe(false)
    expect(result.current.status).toBe('idle')
    expect(result.current.currentVersion).toBe('0.1.23')
    expect(result.current.isChecking).toBe(false)
    expect(result.current.isDownloading).toBe(false)
    expect(result.current.isDownloaded).toBe(false)
    expect(result.current.isUpdateAvailable).toBe(false)
  })

  it('loads version and status, and subscribes to events in desktop mode', async () => {
    let statusCallback: ((payload: any) => void) | null = null

    const mockUpdater = {
      getVersion: vi.fn().mockResolvedValue('0.1.0'),
      getStatus: vi.fn().mockResolvedValue({
        status: 'idle',
        version: undefined,
        progress: undefined,
        error: undefined,
      }),
      checkForUpdates: vi.fn().mockResolvedValue({ status: 'checking' }),
      downloadUpdate: vi.fn().mockResolvedValue({ status: 'downloading' }),
      installUpdate: vi.fn().mockResolvedValue(true),
      onStatusChanged: vi.fn().mockImplementation((cb) => {
        statusCallback = cb
        return () => {
          statusCallback = null
        }
      }),
    }

    ;(window as any).desktopAPI = {
      updater: mockUpdater,
    }

    const { result } = renderHook(() => useAppUpdater())

    expect(result.current.isDesktop).toBe(true)

    // Wait for initial async resolution
    await waitFor(() => {
      expect(result.current.currentVersion).toBe('0.1.0')
    })

    expect(mockUpdater.getVersion).toHaveBeenCalled()
    expect(mockUpdater.getStatus).toHaveBeenCalled()
    expect(mockUpdater.onStatusChanged).toHaveBeenCalled()

    // Trigger update-available event
    act(() => {
      statusCallback?.({
        status: 'available',
        version: '0.2.0',
        releaseNotes: 'New awesome features',
      })
    })

    expect(result.current.status).toBe('available')
    expect(result.current.availableVersion).toBe('0.2.0')
    expect(result.current.releaseNotes).toBe('New awesome features')
    expect(result.current.isUpdateAvailable).toBe(true)

    // Trigger download progress
    act(() => {
      statusCallback?.({
        status: 'downloading',
        progress: {
          percent: 50,
          bytesPerSecond: 1048576,
          transferred: 52428800,
          total: 104857600,
        },
      })
    })

    expect(result.current.isDownloading).toBe(true)
    expect(result.current.progress?.percent).toBe(50)

    // Trigger downloaded
    act(() => {
      statusCallback?.({
        status: 'downloaded',
        version: '0.2.0',
      })
    })

    expect(result.current.isDownloaded).toBe(true)
    expect(result.current.isDismissed).toBe(false)

    // Test dismiss notification
    act(() => {
      result.current.dismissNotification()
    })

    expect(result.current.isDismissed).toBe(true)

    // Test modal open / close
    expect(result.current.isModalOpen).toBe(false)
    act(() => {
      result.current.openUpdateModal()
    })
    expect(result.current.isModalOpen).toBe(true)
    act(() => {
      result.current.closeUpdateModal()
    })
    expect(result.current.isModalOpen).toBe(false)

    // Test auto-check and auto-download
    act(() => {
      result.current.setAutoCheck(false)
    })
    expect(result.current.autoCheck).toBe(false)

    act(() => {
      result.current.setAutoDownload(false)
    })
    expect(result.current.autoDownload).toBe(false)

    // Test installUpdate action
    await act(async () => {
      await result.current.installUpdate()
    })

    expect(mockUpdater.installUpdate).toHaveBeenCalled()
  })
})
