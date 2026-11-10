import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppLoadingState } from '../hooks/use-app-loading-state'

let mockIsLoading = false
vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({
    isLoading: mockIsLoading,
    isAuthenticated: false,
    user: null,
  }),
}))

let mockDesktop = false
vi.mock('@/lib/desktop/api', () => ({
  isDesktop: () => mockDesktop,
  getDesktopAPI: () => ({
    onMainIpcReady: () => Promise.resolve(),
    updater: {
      checkForUpdates: vi.fn().mockResolvedValue({}),
      downloadUpdate: vi.fn().mockResolvedValue({}),
      installUpdate: vi.fn().mockResolvedValue({}),
    },
  }),
}))

const mockUpdater = {
  status: 'idle' as const,
  availableVersion: null as string | null,
  progress: null as any,
  error: null as string | null,
  downloadUpdate: vi.fn().mockResolvedValue({}),
  installUpdate: vi.fn().mockResolvedValue({}),
  checkForUpdates: vi.fn().mockResolvedValue({}),
}

vi.mock('../hooks/use-app-updater', () => ({
  useAppUpdater: () => mockUpdater,
}))

vi.mock('../utils/loading-screen-utils', () => ({
  getLoadingStatusMessage: vi.fn().mockReturnValue('Starting Otix…'),
  formatTransferProgress: vi.fn().mockReturnValue({
    percent: 0,
    transferredText: '',
    speedText: '',
  }),
  dismissInitialLoadingScreen: vi.fn(),
}))

describe('useAppLoadingState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockIsLoading = false
    mockDesktop = false
    mockUpdater.status = 'idle'
    mockUpdater.availableVersion = null
    mockUpdater.progress = null
    mockUpdater.downloadUpdate.mockClear()
    mockUpdater.installUpdate.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('initializes with loading state and completes after minDisplayMs', () => {
    const { result } = renderHook(() => useAppLoadingState(300))

    expect(result.current.isMounted).toBe(true)
    expect(result.current.isReady).toBe(false)
    expect(result.current.isExiting).toBe(false)

    // Advance past minDisplayMs
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current.isReady).toBe(true)
    expect(result.current.isExiting).toBe(true)

    // Advance past exit animation
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.isMounted).toBe(false)
  })

  it('stays mounted while auth is resolving', () => {
    mockIsLoading = true
    const { result } = renderHook(() => useAppLoadingState(300))

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current.isReady).toBe(false)
    expect(result.current.isMounted).toBe(true)
  })

  it('triggers download and stays mounted when update is downloading in desktop', () => {
    mockDesktop = true
    mockUpdater.status = 'available'
    mockUpdater.availableVersion = '1.5.0'

    const { result, rerender } = renderHook(() => useAppLoadingState(300))

    expect(mockUpdater.downloadUpdate).toHaveBeenCalled()

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(400)
    })

    // Still downloading
    expect(result.current.isReady).toBe(false)

    // Change status to downloading
    act(() => {
      mockUpdater.status = 'downloading'
      rerender()
    })
    expect(result.current.isDownloadingUpdate).toBe(true)
    expect(result.current.isReady).toBe(false)
  })
})
