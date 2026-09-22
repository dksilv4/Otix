import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { clearDesktopAPICache } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'

// Mock dependencies
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
}))

const mockSaveConfig = vi.fn().mockResolvedValue({})
vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      id: 'default',
      userId: '1',
      sabnzbdHost: '127.0.0.1',
      sabnzbdPort: 8080,
      sabnzbdApiKey: 'secret',
      sabnzbdUseSsl: false,
      nzbplanetApiKey: null,
      sabnzbdCompletePath: '/complete',
      downloadPath: '/server/isos',
      postProcessEnabled: true,
      autoSearchWishlist: true,
      wishlistIntervalHours: 6,
      preferredRepackers: 'FitGirl',
      allowHypervisor: false,
      autoOrganizeEnabled: true,
      namingTemplate: '{Title}/{OriginalName}.{ext}',
    },
    saveConfig: mockSaveConfig,
    isLoading: false,
  }),
}))

describe('SettingsPathsSection', () => {
  beforeEach(() => {
    clearDesktopAPICache()
    vi.clearAllMocks()
    localStorage.clear()
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([
        { path: '/games/steam', type: 'game' },
        { path: '/isos/ps2', type: 'iso' },
      ]),
      saveScanPaths: vi.fn().mockResolvedValue(undefined),
      scanPaths: vi.fn().mockResolvedValue([]),
      getDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games', gamesInstallPath: '/games/installed' }),
      setDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games', gamesInstallPath: '/games/installed' }),
      selectDirectory: vi.fn().mockResolvedValue(null),
    }
  })

  it('renders destinations and scan folders as separate cards', async () => {
    render(<SettingsPathsSection />)

    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scan folders' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Remote path mappings' })).not.toBeInTheDocument()
    expect(screen.getByText('Game installation folder')).toBeInTheDocument()
    expect(screen.getByText('Games download folder')).toBeInTheDocument()
    expect(screen.getByText('ISOs & disc images')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan now/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Scan folder type' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /game folder/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /iso folder/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save games path/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Paths & storage' })).not.toBeInTheDocument()

    // Wait for loaded scan paths — draft row stays visible for another entry
    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
      expect(screen.getByText('/isos/ps2')).toBeInTheDocument()
      expect(screen.getByText('Add another folder')).toBeInTheDocument()
    })

    // Badges on saved rows (draft toggle also has Game/ISO labels)
    expect(screen.getAllByText('Game').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ISO').length).toBeGreaterThanOrEqual(1)
  })

  it('shows an empty draft scan row when no folders are configured', async () => {
    ;(window as any).desktopAPI.getScanPaths = vi.fn().mockResolvedValue([])
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByText('Add a folder to scan')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText(/e\.g\. D:\\Games\\Steam or ~\/Games|e\.g\. \/media\/games/)).toBeInTheDocument()
  })

  it('adds a draft scan path on Enter and shows success toast', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.getScanPaths = vi.fn().mockResolvedValue([])
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByText('Add a folder to scan')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/e\.g\. D:\\Games\\Steam or ~\/Games|e\.g\. \/media\/games/)
    await user.type(input, '/extra/games{Enter}')

    await waitFor(() => {
      expect((window as any).desktopAPI.saveScanPaths).toHaveBeenCalledWith([
        { path: '/extra/games', type: 'game' },
      ])
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Scan Path Added',
          variant: 'success',
        }),
      )
    })
  })

  it('toggles scan type to ISO and adds an ISO path', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.getScanPaths = vi.fn().mockResolvedValue([])
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByText('Add a folder to scan')).toBeInTheDocument()
    })

    // Toggle to ISO
    const isoButton = screen.getByRole('button', { name: 'ISO' })
    await user.click(isoButton)
    expect(isoButton).toHaveAttribute('aria-pressed', 'true')

    const input = screen.getByPlaceholderText(/e\.g\. D:\\ISOs or \/Volumes\/Storage\/ROMs|e\.g\. \/media\/isos/)
    await user.type(input, '/storage/isos{Enter}')

    await waitFor(() => {
      expect((window as any).desktopAPI.saveScanPaths).toHaveBeenCalledWith([
        { path: '/storage/isos', type: 'iso' },
      ])
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Scan Path Added',
          variant: 'success',
        }),
      )
    })
  })

  it('shows a warning toast when adding an already monitored path', async () => {
    const user = userEvent.setup()
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/e\.g\. D:\\Games\\Steam or ~\/Games|e\.g\. \/media\/games/)
    await user.type(input, '/games/steam{Enter}')

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Path Already Monitored',
          variant: 'warning',
        }),
      )
    })
  })

  it('triggers library scan on Scan Now click and shows success toast', async () => {
    const user = userEvent.setup()
    const onScanComplete = vi.fn()
    render(<SettingsPathsSection onScanComplete={onScanComplete} />)

    const scanBtn = screen.getByRole('button', { name: /scan now/i })
    await user.click(scanBtn)

    await waitFor(() => {
      expect((window as any).desktopAPI.scanPaths).toHaveBeenCalledWith(
        ['/games/steam'],
        ['/isos/ps2'],
      )
      expect(onScanComplete).toHaveBeenCalled()
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Library Scanned',
          variant: 'success',
        }),
      )
    })
  })

  it('handles scan failure and shows error toast', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.scanPaths = vi.fn().mockRejectedValue(new Error('Scan crashed'))
    render(<SettingsPathsSection />)

    const scanBtn = screen.getByRole('button', { name: /scan now/i })
    await user.click(scanBtn)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Scan Failed',
          variant: 'error',
        }),
      )
    })
  })

  it('removes a scan path when clicking remove and shows default toast', async () => {
    const user = userEvent.setup()
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByRole('button', { name: /remove path/i })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.saveScanPaths).toHaveBeenCalledWith([
        { path: '/isos/ps2', type: 'iso' },
      ])
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Path Removed',
          variant: 'default',
        }),
      )
    })
  })

  it('persists game installation destination via setDesktopSettings on Enter, registers scan path, and shows success toast', async () => {
    const user = userEvent.setup()
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/games/installed')).toBeInTheDocument()
    })

    const input = screen.getByDisplayValue('/games/installed')
    await user.clear(input)
    await user.type(input, 'C:\\Games\\Installed{Enter}')

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesInstallPath: 'C:\\Games\\Installed',
      })
      expect(localStorage.getItem('otix:games-install-dir')).toBe('C:\\Games\\Installed')
      expect((window as any).desktopAPI.saveScanPaths).toHaveBeenCalledWith(
        expect.arrayContaining([
          { path: 'C:\\Games\\Installed', type: 'game' },
        ]),
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Installation Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('persists games destination via setDesktopSettings on Enter and shows success toast', async () => {
    const user = userEvent.setup()
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/downloads/games')).toBeInTheDocument()
    })

    const input = screen.getByDisplayValue('/downloads/games')
    await user.clear(input)
    await user.type(input, 'D:\\Games{Enter}')

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesDownloadPath: 'D:\\Games',
      })
      expect(localStorage.getItem('otix:games-download-dir')).toBe('D:\\Games')
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Games Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('merges existing download config when saving ISO destination and shows success toast', async () => {
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/server/isos')).toBeInTheDocument()
    })

    const input = screen.getByDisplayValue('/server/isos')
    fireEvent.change(input, { target: { value: '/media/isos' } })
    await waitFor(() => expect(input).toHaveValue('/media/isos'))
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadPath: '/media/isos',
          sabnzbdApiKey: 'secret',
          autoSearchWishlist: true,
          preferredRepackers: 'FitGirl',
          namingTemplate: '{Title}/{OriginalName}.{ext}',
          postProcessEnabled: true,
        }),
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'ISO Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('allows selecting folder via browse button for game installation folder', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.selectDirectory = vi.fn().mockResolvedValue('/selected/install-dir')
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/games/installed')).toBeInTheDocument()
    })

    const browseButtons = screen.getAllByRole('button', { name: 'Browse' })
    // Index 0 is Game installation folder Browse button
    await user.click(browseButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesInstallPath: '/selected/install-dir',
      })
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Installation Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('allows selecting folder via browse button for games download folder', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.selectDirectory = vi.fn().mockResolvedValue('/selected/folder')
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/downloads/games')).toBeInTheDocument()
    })

    const browseButtons = screen.getAllByRole('button', { name: 'Browse' })
    // Index 1 is Games download folder Browse button
    await user.click(browseButtons[1])

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesDownloadPath: '/selected/folder',
      })
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Games Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('restores all paths from localStorage immediately on mount/reload', async () => {
    localStorage.setItem('otix:games-install-dir', '/preloaded/installed')
    localStorage.setItem('otix:games-download-dir', '/preloaded/downloads')
    localStorage.setItem('otix:iso-download-dir', '/preloaded/isos')
    localStorage.setItem('otix:scan-paths', JSON.stringify(['/preloaded/scan1']))
    ;(window as any).desktopAPI = null

    render(<SettingsPathsSection nodeId={-1} />)

    expect(screen.getByDisplayValue('/preloaded/installed')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/preloaded/downloads')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/preloaded/isos')).toBeInTheDocument()
    expect(screen.getByText('/preloaded/scan1')).toBeInTheDocument()
  })

  it('commits destination path change on blur without needing Enter key', async () => {
    const user = userEvent.setup()
    render(<SettingsPathsSection />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/games/installed')).toBeInTheDocument()
    })

    const installInput = screen.getByDisplayValue('/games/installed')
    await user.clear(installInput)
    await user.type(installInput, 'C:\\Games\\MyInstall')
    fireEvent.blur(installInput)

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesInstallPath: 'C:\\Games\\MyInstall',
      })
      expect(localStorage.getItem('otix:games-install-dir')).toBe('C:\\Games\\MyInstall')
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Installation Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('loads remote node paths from API and caches them in node-specific localStorage', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/desktop')) {
        return { data: { gamesDownloadPath: '/remote/downloads', gamesInstallPath: '/remote/installed' } } as any
      }
      if (url.includes('/organize')) {
        return { data: { isoDownloadPath: '/remote/isos' } } as any
      }
      if (url.includes('/libraries')) {
        return { data: { libraries: [{ path: '/remote/scan', kind: 'game' }] } } as any
      }
      return { data: {} } as any
    })

    render(<SettingsPathsSection nodeId={2} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/remote/installed')).toBeInTheDocument()
      expect(screen.getByDisplayValue('/remote/downloads')).toBeInTheDocument()
      expect(screen.getByDisplayValue('/remote/isos')).toBeInTheDocument()
      expect(screen.getByText('/remote/scan')).toBeInTheDocument()
    })

    expect(localStorage.getItem('otix:games-install-dir:node:2')).toBe('/remote/installed')
    expect(localStorage.getItem('otix:games-download-dir:node:2')).toBe('/remote/downloads')
    expect(localStorage.getItem('otix:iso-download-dir:node:2')).toBe('/remote/isos')
  })

  it('still loads desktop paths even if organize endpoint rejects for remote node', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.includes('/desktop')) {
        return { data: { gamesDownloadPath: '/remote/downloads', gamesInstallPath: '/remote/installed' } } as any
      }
      if (url.includes('/organize')) {
        throw new Error('502 Bad Gateway')
      }
      return { data: {} } as any
    })

    render(<SettingsPathsSection nodeId={2} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('/remote/installed')).toBeInTheDocument()
      expect(screen.getByDisplayValue('/remote/downloads')).toBeInTheDocument()
    })
  })
})

