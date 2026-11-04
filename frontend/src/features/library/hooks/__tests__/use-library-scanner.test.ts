import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLibraryScanner } from '../use-library-scanner'

const mockStartScan = vi.fn()
const mockFinishScan = vi.fn()
const mockErrorScan = vi.fn()
const mockRefetchMatches = vi.fn().mockResolvedValue({})
const mockInvalidateQueries = vi.fn()

let mockMatchesData: any[] = [
  { id: 1, matchStatus: 'matched', serverName: 'This PC' },
  { id: 2, matchStatus: 'needs_review', serverName: 'Living Room PC' },
  { id: 3, matchStatus: 'unmatched', serverName: 'Living Room PC' },
]

let mockServers: any[] = [{ id: 10, name: 'Living Room PC' }]

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

vi.mock('@/features/settings/hooks/use-scan-progress', () => ({
  useScanProgress: () => ({
    isScanning: false,
    progress: 0,
    phase: 'idle',
    currentDir: '',
    startScan: mockStartScan,
    finishScan: mockFinishScan,
    errorScan: mockErrorScan,
  }),
}))

vi.mock('@/features/settings/hooks/use-node-paths', () => ({
  useGameMatches: () => ({
    data: mockMatchesData,
    refetch: mockRefetchMatches,
  }),
}))

vi.mock('@/features/settings/context/settings-node-context', () => ({
  useSettingsNode: () => ({
    servers: mockServers,
  }),
}))

vi.mock('@/lib/desktop/api', () => ({
  hasDesktopAPI: () => false,
  getDesktopAPI: () => null,
  isDesktop: () => false,
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('useLibraryScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('aggregates summary counts across matches and devices', () => {
    const { result } = renderHook(() => useLibraryScanner())

    expect(result.current.summary.totalCount).toBe(3)
    expect(result.current.summary.matchedCount).toBe(1)
    expect(result.current.summary.needsReviewCount).toBe(1)
    expect(result.current.summary.unmatchedCount).toBe(1)
    expect(result.current.summary.devicesCount).toBe(2) // This PC + Living Room PC
  })

  it('allows dismissing the summary banner', () => {
    const { result } = renderHook(() => useLibraryScanner())

    expect(result.current.isBannerVisible).toBe(true)

    act(() => {
      result.current.dismissBanner()
    })

    expect(result.current.isBannerVisible).toBe(false)
  })

  it('triggers scan and re-evaluates matches and banner state', async () => {
    const { result } = renderHook(() => useLibraryScanner())

    await act(async () => {
      await result.current.triggerScan()
    })

    expect(mockStartScan).toHaveBeenCalledTimes(1)
    expect(mockFinishScan).toHaveBeenCalledTimes(1)
    expect(mockRefetchMatches).toHaveBeenCalledTimes(1)
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1)
  })
})
