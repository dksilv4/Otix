import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { InstallerPage } from '../pages/installer-page'

describe('InstallerPage Full Flow', () => {
  let mockDesktopAPI: any
  let progressCallback: ((progress: any) => void) | null = null

  beforeEach(() => {
    progressCallback = null

    if (typeof SVGElement !== 'undefined') {
      SVGElement.prototype.getTotalLength = () => 100
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    mockDesktopAPI = {
      installerGetInfo: vi.fn().mockResolvedValue({
        version: '0.1.26',
        defaultInstallPath: 'C:\\Program Files\\Otix',
        isElevated: true,
        sourcePath: 'C:\\Setup',
      }),
      installerGetDiskSpace: vi.fn().mockResolvedValue({
        freeBytes: 200 * 1024 * 1024 * 1024,
        totalBytes: 500 * 1024 * 1024 * 1024,
        drive: 'C:',
      }),
      installerBrowseDirectory: vi.fn().mockResolvedValue('D:\\Games\\Otix'),
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

  const renderWithProviders = () => {
    return render(
      <ModalProvider>
        <InstallerPage />
        <ModalRoot />
      </ModalProvider>,
    )
  }

  it('renders welcome step and allows navigating through full setup to completion', async () => {
    renderWithProviders()

    // 1. Welcome step
    expect(screen.getByRole('heading', { name: 'Otix' })).toBeDefined()
    expect(screen.getByRole('button', { name: /Options/i })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Install Now' })).toBeDefined()

    // 2. Click Options to go to Config step
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Options/i }))
    })

    expect(screen.getByRole('heading', { name: 'Install Otix' })).toBeDefined()
    expect(screen.getByText('Installation Directory')).toBeDefined()
    expect(screen.getByText('Create Desktop shortcut')).toBeDefined()
    expect(screen.getByText('Create Start Menu shortcut')).toBeDefined()

    // 3. Test Back button
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Back/i })[0])
    })
    expect(screen.getByRole('heading', { name: 'Otix' })).toBeDefined()

    // 4. Return to Config and Start Install
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Options/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install Otix' }))
    })

    // 5. Progress step
    expect(screen.getByText('Installing Otix...')).toBeDefined()
    expect(mockDesktopAPI.installerStartInstall).toHaveBeenCalled()

    // 6. Push progress update
    expect(progressCallback).not.toBeNull()
    act(() => {
      progressCallback!({ percent: 75, status: 'Creating Windows shortcuts...' })
    })
    expect(screen.getByText('Creating Windows shortcuts...')).toBeDefined()

    // 7. Complete install
    act(() => {
      progressCallback!({ percent: 100, status: 'Installation completed!' })
    })

    await waitFor(() => {
      expect(screen.getByText('Ready to Play!')).toBeDefined()
      expect(screen.getByRole('button', { name: /Launch Otix/i })).toBeDefined()
    })

    // 8. Launch Otix
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Launch Otix/i }))
    })
    expect(mockDesktopAPI.installerFinishAndLaunch).toHaveBeenCalled()
  })

  it('triggers quick install directly from welcome step', async () => {
    renderWithProviders()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install Now' }))
    })

    expect(screen.getByText('Installing Otix...')).toBeDefined()
    expect(mockDesktopAPI.installerStartInstall).toHaveBeenCalled()
  })

  it('renders error state and retries on failure', async () => {
    mockDesktopAPI.installerStartInstall.mockResolvedValueOnce({
      success: false,
      error: 'Corrupted binary archive package.',
    })

    renderWithProviders()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install Now' }))
    })

    await waitFor(() => {
      expect(screen.getByText('Installation Failed')).toBeDefined()
      expect(screen.getByText('Corrupted binary archive package.')).toBeDefined()
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeDefined()
    })

    // Retry should trigger installerStartInstall again
    mockDesktopAPI.installerStartInstall.mockResolvedValueOnce({ success: true })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Try Again/i }))
    })

    expect(screen.getByText('Installing Otix...')).toBeDefined()
  })

  it('shows cancel modal when user attempts to exit while installation is in progress', async () => {
    renderWithProviders()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install Now' }))
    })

    expect(screen.getByText('Installing Otix...')).toBeDefined()

    // Click Cancel during installation
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    // Modal should appear
    expect(screen.getByText('Cancel Installation?')).toBeDefined()
    expect(screen.getByText(/Otix is not completely installed yet/i)).toBeDefined()

    // Click Continue Setup
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue Setup' }))
    })

    // Modal dismissed, still installing
    await waitFor(() => {
      expect(screen.queryByText('Cancel Installation?')).toBeNull()
    })
    expect(screen.getByText('Installing Otix...')).toBeDefined()

    // Now confirm cancel
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit Installer' }))
    })

    expect(mockDesktopAPI.installerCancel).toHaveBeenCalled()
  })
})
