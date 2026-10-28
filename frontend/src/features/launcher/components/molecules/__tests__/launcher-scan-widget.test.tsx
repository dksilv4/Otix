import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LauncherScanWidget } from '../launcher-scan-widget'

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('LauncherScanWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).desktopAPI
  })

  it('renders Scan Now button and triggers simulated scan when no desktop API', async () => {
    const user = userEvent.setup()
    render(<LauncherScanWidget />)

    const scanBtn = screen.getByRole('button', { name: /scan now/i })
    expect(scanBtn).toBeInTheDocument()

    await user.click(scanBtn)

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Scanner Simulated',
        variant: 'info',
      }),
    )
  })

  it('handles scan failure and presents actionable error toast without hanging', async () => {
    const user = userEvent.setup()
    const mockScanPaths = vi.fn().mockRejectedValue({
      response: {
        status: 502,
        data: {
          detail: 'Failed to contact game server node: Network is unreachable. Ensure the node is online and the network route is available.',
        },
      },
    })
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([{ path: '/games', type: 'game' }]),
      scanPaths: mockScanPaths,
    }

    render(<LauncherScanWidget />)

    const scanBtn = screen.getByRole('button', { name: /scan now/i })
    await user.click(scanBtn)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Scan Failed',
          description: 'Failed to contact game server node: Network is unreachable. Ensure the node is online and the network route is available.',
          variant: 'error',
        }),
      )
    })

    // Verify state resets and button is re-enabled
    expect(screen.getByRole('button', { name: /scan now/i })).not.toBeDisabled()
  })
})
