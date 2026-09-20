import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { clearDesktopAPICache } from '@/lib/desktop/api'

// Mock dependencies
vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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
      getDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games' }),
      setDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '/downloads/games' }),
      selectDirectory: vi.fn().mockResolvedValue(null),
    }
  })

  it('renders destinations and scan folders as separate cards', async () => {
    render(<SettingsPathsSection />)

    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scan folders' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Remote path mappings' })).not.toBeInTheDocument()
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

  it('adds a draft scan path on Enter', async () => {
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
    })
  })

  it('triggers library scan on Scan Now click', async () => {
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
    })
  })

  it('removes a scan path when clicking remove', async () => {
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
    })
  })

  it('persists games destination via setDesktopSettings on Enter', async () => {
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
    })
  })

  it('merges existing download config when saving ISO destination', async () => {
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
    })
  })
})
