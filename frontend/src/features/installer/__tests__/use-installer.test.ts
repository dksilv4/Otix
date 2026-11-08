import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useInstaller } from '../hooks/use-installer'
import { REQUIRED_DISK_SPACE_BYTES } from '../constants'

describe('useInstaller Hook', () => {
  let mockDesktopAPI: any
  let progressCallback: ((progress: any) => void) | null = null

  beforeEach(() => {
    progressCallback = null
    mockDesktopAPI = {
      installerGetInfo: vi.fn().mockResolvedValue({
        version: '0.1.27',
        defaultInstallPath: 'D:\\Games\\Otix',
        isElevated: true,
        sourcePath: 'D:\\Setup',
      }),
      installerGetDiskSpace: vi.fn().mockImplementation(async (targetPath: string) => {
        if (targetPath && targetPath.includes('LowSpaceDir')) {
          return {
            freeBytes: REQUIRED_DISK_SPACE_BYTES - 1000,
            totalBytes: 500 * 1024 * 1024 * 1024,
            drive: 'C:',
          }
        }
        return {
          freeBytes: 150 * 1024 * 1024 * 1024,
          totalBytes: 500 * 1024 * 1024 * 1024,
          drive: 'D:',
        }
      }),
      installerBrowseDirectory: vi.fn().mockResolvedValue('E:\\OtixApp'),
      installerStartInstall: vi.fn().mockResolvedValue({ success: true }),
      installerOnProgress: vi.fn().mockImplementation((cb) => {
        progressCallback = cb
        return vi.fn()
      }),
      installerFinishAndLaunch: vi.fn().mockResolvedValue(undefined),
      installerCancel: vi.fn().mockResolvedValue(undefined),
      minimizeWindow: vi.fn().mockResolvedValue(undefined),
      closeWindow: vi.fn().mockResolvedValue(undefined),
    }

    ;(window as any).desktopAPI = mockDesktopAPI
  })

  afterEach(() => {
    delete (window as any).desktopAPI
    vi.restoreAllMocks()
  })

  it('initializes with default state and loads system info from desktop API', async () => {
    const { result } = renderHook(() => useInstaller())

    expect(result.current.step).toBe('welcome')
    expect(result.current.createDesktopShortcut).toBe(true)
    expect(result.current.createStartMenuShortcut).toBe(true)
    expect(result.current.startOnBoot).toBe(false)
    expect(result.current.launchOnExit).toBe(true)

    await waitFor(() => {
      expect(result.current.installPath).toBe('D:\\Games\\Otix')
      expect(result.current.version).toBe('0.1.27')
      expect(result.current.isElevated).toBe(true)
    })
  })

  it('navigates between steps cleanly', async () => {
    const { result } = renderHook(() => useInstaller())

    await waitFor(() => {
      expect(result.current.installPath).toBe('D:\\Games\\Otix')
    })

    act(() => {
      result.current.handleGoToConfig()
    })
    expect(result.current.step).toBe('config')

    act(() => {
      result.current.handleGoBackToWelcome()
    })
    expect(result.current.step).toBe('welcome')
  })

  it('allows browsing directory and updates install path and disk space', async () => {
    const { result } = renderHook(() => useInstaller())

    await waitFor(() => {
      expect(result.current.installPath).toBe('D:\\Games\\Otix')
    })

    await act(async () => {
      await result.current.handleBrowseFolder()
    })

    expect(mockDesktopAPI.installerBrowseDirectory).toHaveBeenCalled()
    expect(result.current.installPath).toBe('E:\\OtixApp')

    await waitFor(() => {
      expect(mockDesktopAPI.installerGetDiskSpace).toHaveBeenCalledWith('E:\\OtixApp')
    })
  })

  it('computes hasSpace accurately based on required threshold', async () => {
    const { result } = renderHook(() => useInstaller())

    await waitFor(() => {
      expect(result.current.hasSpace).toBe(true)
    })

    act(() => {
      result.current.setInstallPath('C:\\LowSpaceDir')
    })

    await waitFor(() => {
      expect(result.current.hasSpace).toBe(false)
    })
  })

  it('handles successful install lifecycle and completes on 100% progress', async () => {
    const { result } = renderHook(() => useInstaller())

    await waitFor(() => {
      expect(result.current.installPath).toBe('D:\\Games\\Otix')
    })

    await act(async () => {
      await result.current.handleStartInstall()
    })

    expect(result.current.step).toBe('installing')
    expect(mockDesktopAPI.installerStartInstall).toHaveBeenCalledWith({
      installPath: 'D:\\Games\\Otix',
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      startOnBoot: false,
    })

    // Simulate progress updates from IPC
    expect(progressCallback).not.toBeNull()
    act(() => {
      progressCallback!({ percent: 50, status: 'Copying files...' })
    })
    expect(result.current.progress.percent).toBe(50)
    expect(result.current.progress.status).toBe('Copying files...')

    // Completion at 100%
    act(() => {
      progressCallback!({ percent: 100, status: 'Done!' })
    })
    expect(result.current.step).toBe('complete')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('transitions to error state when backend installation fails', async () => {
    mockDesktopAPI.installerStartInstall.mockResolvedValueOnce({
      success: false,
      error: 'Permission denied in destination directory',
    })

    const { result } = renderHook(() => useInstaller())

    await waitFor(() => {
      expect(result.current.installPath).toBe('D:\\Games\\Otix')
    })

    await act(async () => {
      await result.current.handleStartInstall()
    })

    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe('Permission denied in destination directory')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('invokes finish-and-launch and cancel desktop controls', async () => {
    const { result } = renderHook(() => useInstaller())

    await act(async () => {
      await result.current.handleFinishAndLaunch()
    })
    expect(mockDesktopAPI.installerFinishAndLaunch).toHaveBeenCalled()

    await act(async () => {
      await result.current.handleCancel()
    })
    expect(mockDesktopAPI.installerCancel).toHaveBeenCalled()

    await act(async () => {
      await result.current.handleMinimize()
    })
    expect(mockDesktopAPI.minimizeWindow).toHaveBeenCalled()
  })
})
