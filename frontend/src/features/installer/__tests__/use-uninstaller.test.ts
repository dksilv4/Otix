import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUninstaller } from '../hooks/use-uninstaller'

describe('useUninstaller Hook', () => {
  let mockDesktopAPI: any
  let progressCallback: ((progress: any) => void) | null = null

  beforeEach(() => {
    progressCallback = null
    mockDesktopAPI = {
      uninstallerConfirm: vi.fn().mockResolvedValue({ success: true }),
      uninstallerOnProgress: vi.fn().mockImplementation((cb) => {
        progressCallback = cb
        return vi.fn()
      }),
      minimizeWindow: vi.fn().mockResolvedValue(undefined),
      closeWindow: vi.fn().mockResolvedValue(undefined),
    }

    ;(window as any).desktopAPI = mockDesktopAPI
  })

  afterEach(() => {
    delete (window as any).desktopAPI
    vi.restoreAllMocks()
  })

  it('initializes with confirmation step and default options', () => {
    const { result } = renderHook(() => useUninstaller())

    expect(result.current.step).toBe('confirm')
    expect(result.current.removeUserData).toBe(false)
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('toggles removeUserData option', () => {
    const { result } = renderHook(() => useUninstaller())

    act(() => {
      result.current.setRemoveUserData(true)
    })
    expect(result.current.removeUserData).toBe(true)
  })

  it('handles uninstall confirmation and completes on 100% progress', async () => {
    const { result } = renderHook(() => useUninstaller())

    act(() => {
      result.current.setRemoveUserData(true)
    })

    await act(async () => {
      await result.current.handleConfirmUninstall()
    })

    expect(result.current.step).toBe('uninstalling')
    expect(mockDesktopAPI.uninstallerConfirm).toHaveBeenCalledWith({
      removeUserData: true,
    })

    expect(progressCallback).not.toBeNull()
    act(() => {
      progressCallback!({ percent: 50, status: 'Cleaning registry entries...' })
    })
    expect(result.current.progress.percent).toBe(50)
    expect(result.current.progress.status).toBe('Cleaning registry entries...')

    act(() => {
      progressCallback!({ percent: 100, status: 'Otix uninstalled successfully.' })
    })
    expect(result.current.step).toBe('complete')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('transitions to error step when uninstallation fails', async () => {
    mockDesktopAPI.uninstallerConfirm.mockResolvedValueOnce({
      success: false,
      error: 'Access denied removing files',
    })

    const { result } = renderHook(() => useUninstaller())

    await act(async () => {
      await result.current.handleConfirmUninstall()
    })

    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe('Access denied removing files')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('calls desktop window controls on close and minimize', async () => {
    const { result } = renderHook(() => useUninstaller())

    await act(async () => {
      await result.current.handleClose()
    })
    expect(mockDesktopAPI.closeWindow).toHaveBeenCalled()

    await act(async () => {
      await result.current.handleMinimize()
    })
    expect(mockDesktopAPI.minimizeWindow).toHaveBeenCalled()
  })
})
