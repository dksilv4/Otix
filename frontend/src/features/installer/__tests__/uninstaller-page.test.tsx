import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { UninstallerPage } from '../pages/uninstaller-page'

describe('UninstallerPage Flow', () => {
  let mockDesktopAPI: any
  let progressCallback: ((progress: any) => void) | null = null

  beforeEach(() => {
    progressCallback = null

    if (typeof SVGElement !== 'undefined') {
      SVGElement.prototype.getTotalLength = () => 100
    }

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

  it('renders confirmation view and navigates to complete on successful uninstall', async () => {
    render(<UninstallerPage />)

    expect(screen.getByRole('heading', { name: 'Uninstall Otix' })).toBeDefined()
    expect(screen.getByText('Are you sure you want to uninstall Otix?')).toBeDefined()
    expect(screen.getByText(/Also remove user settings, cache, and local library database/i)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Uninstall' })).toBeDefined()

    // Toggle user data deletion checkbox
    const checkbox = screen.getByRole('checkbox')
    await act(async () => {
      fireEvent.click(checkbox)
    })

    // Click Uninstall
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    })

    expect(mockDesktopAPI.uninstallerConfirm).toHaveBeenCalledWith({
      removeUserData: true,
    })
    expect(screen.getByText('Uninstalling Otix...')).toBeDefined()

    // Trigger IPC progress to 100%
    expect(progressCallback).not.toBeNull()
    act(() => {
      progressCallback!({ percent: 100, status: 'Otix uninstalled successfully.' })
    })

    await waitFor(() => {
      expect(screen.getByText('Otix Has Been Uninstalled')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Close' })).toBeDefined()
    })

    // Click Close
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(mockDesktopAPI.closeWindow).toHaveBeenCalled()
  })

  it('handles cancellation from confirmation step', async () => {
    render(<UninstallerPage />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(mockDesktopAPI.closeWindow).toHaveBeenCalled()
  })

  it('renders error state when uninstallation encounters an error', async () => {
    mockDesktopAPI.uninstallerConfirm.mockResolvedValueOnce({
      success: false,
      error: 'Locked process preventing uninstallation.',
    })

    render(<UninstallerPage />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    })

    await waitFor(() => {
      expect(screen.getByText('Uninstallation Error')).toBeDefined()
      expect(screen.getByText('Locked process preventing uninstallation.')).toBeDefined()
    })
  })
})
