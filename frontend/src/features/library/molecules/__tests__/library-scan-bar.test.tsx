import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LibraryScanBar } from '../library-scan-bar'

const mockTriggerScan = vi.fn()
const mockDismissBanner = vi.fn()
const mockSetIsMatchCenterOpen = vi.fn()

let mockScannerState = {
  isScanning: false,
  scanProgress: 0,
  scanPhase: 'idle',
  summary: {
    totalCount: 14,
    matchedCount: 12,
    needsReviewCount: 2,
    unmatchedCount: 0,
    devicesCount: 2,
  },
  isBannerVisible: true,
  dismissBanner: mockDismissBanner,
  triggerScan: mockTriggerScan,
  isMatchCenterOpen: false,
  setIsMatchCenterOpen: mockSetIsMatchCenterOpen,
}

vi.mock('../../hooks/use-library-scanner', () => ({
  useLibraryScanner: () => mockScannerState,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/features/settings/components/organisms/match-review-center-modal', () => ({
  MatchReviewCenterModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="match-review-center-modal">Match Center Modal</div> : null,
}))

describe('LibraryScanBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScannerState = {
      isScanning: false,
      scanProgress: 0,
      scanPhase: 'idle',
      summary: {
        totalCount: 14,
        matchedCount: 12,
        needsReviewCount: 2,
        unmatchedCount: 0,
        devicesCount: 2,
      },
      isBannerVisible: true,
      dismissBanner: mockDismissBanner,
      triggerScan: mockTriggerScan,
      isMatchCenterOpen: false,
      setIsMatchCenterOpen: mockSetIsMatchCenterOpen,
    }
  })

  it('renders Scan Drives button and triggers scan on click', () => {
    render(<LibraryScanBar showButton={true} />)

    const scanBtn = screen.getByRole('button', { name: /scan drives/i })
    expect(scanBtn).toBeInTheDocument()

    fireEvent.click(scanBtn)
    expect(mockTriggerScan).toHaveBeenCalledTimes(1)
  })

  it('renders summary banner with game count and device information', () => {
    render(<LibraryScanBar showButton={true} />)

    expect(screen.getByText(/14 Games Indexed/i)).toBeInTheDocument()
    expect(screen.getByText(/2 devices/i)).toBeInTheDocument()
    expect(screen.getByText(/2 need attention/i)).toBeInTheDocument()
  })

  it('opens match center modal when clicking Check Matches', () => {
    render(<LibraryScanBar showButton={true} />)

    const checkBtn = screen.getByRole('button', { name: /check matches/i })
    expect(checkBtn).toBeInTheDocument()

    fireEvent.click(checkBtn)
    expect(mockSetIsMatchCenterOpen).toHaveBeenCalledWith(true)
  })

  it('calls dismissBanner when clicking the close button on the summary banner', () => {
    render(<LibraryScanBar showButton={true} />)

    const dismissBtn = screen.getByRole('button', { name: /dismiss scan summary/i })
    expect(dismissBtn).toBeInTheDocument()

    fireEvent.click(dismissBtn)
    expect(mockDismissBanner).toHaveBeenCalledTimes(1)
  })

  it('shows progress percentage when scanning is active', () => {
    mockScannerState.isScanning = true
    mockScannerState.scanProgress = 45

    render(<LibraryScanBar showButton={true} />)

    expect(screen.getByText(/Scanning… 45%/i)).toBeInTheDocument()
  })
})
