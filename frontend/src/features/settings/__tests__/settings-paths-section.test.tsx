import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPathsSection } from '../components/organisms/settings-paths-section'
import { clearDesktopAPICache } from '@/lib/desktop/api'

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


const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const renderSection = (props?: React.ComponentProps<typeof SettingsPathsSection>) =>
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsPathsSection {...props} />
    </QueryClientProvider>,
  )

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
      getDesktopSettings: vi.fn().mockResolvedValue({
        gamesDownloadPath: '/downloads/games',
        gamesInstallPath: '/games/installed',
      }),
      setDesktopSettings: vi.fn().mockResolvedValue({
        gamesDownloadPath: '/downloads/games',
        gamesInstallPath: '/games/installed',
      }),
      selectDirectory: vi.fn().mockResolvedValue(null),
    }
  })

  it('renders paths header, scan now action, filter tabs, and view switcher', async () => {
    renderSection()

    expect(screen.getByRole('heading', { name: 'Paths' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /card view/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument()

    // Filter pills
    expect(screen.getByRole('button', { name: /^all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^installation \(/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^downloads/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^isos/i })).toBeInTheDocument()

    // Wait for loaded folders
    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
      expect(screen.getByText('/isos/ps2')).toBeInTheDocument()
    })
  })

  it('switches between card view and list view', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const listBtn = screen.getByRole('button', { name: /list view/i })
    await user.click(listBtn)
    expect(listBtn).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('otix:paths-view-mode')).toBe('list')

    const cardsBtn = screen.getByRole('button', { name: /card view/i })
    await user.click(cardsBtn)
    expect(cardsBtn).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('otix:paths-view-mode')).toBe('cards')
  })

  it('adds a new scan path on Enter and shows success toast', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.getScanPaths = vi.fn().mockResolvedValue([])
    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add folder/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /add folder/i }))

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

  it('toggles initial role to ISO and adds an ISO path', async () => {
    const user = userEvent.setup()
    ;(window as any).desktopAPI.getScanPaths = vi.fn().mockResolvedValue([])
    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add folder/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /add folder/i }))
    await user.click(screen.getByRole('button', { name: /assign roles/i }))

    const isoToggle = screen.getByRole('button', { name: 'Assign ISO on add' })
    await user.click(isoToggle)

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
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /add folder/i }))

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
    renderSection({ onScanComplete })

    const scanBtn = screen.getByRole('button', { name: /scan now/i })
    await user.click(scanBtn)

    await waitFor(() => {
      expect((window as any).desktopAPI.scanPaths).toHaveBeenCalled()
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
    renderSection()

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

  it('removes a scan path when clicking remove and shows toast', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const removeButtons = screen.getAllByRole('button', { name: /remove/i })
    await user.click(removeButtons[0])

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Path Removed',
        }),
      )
    })
  })

  it('assigns path as Installation folder via card button', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const rolesBtn = screen.getAllByRole('button', { name: /manage roles for/i })[0]
    await user.click(rolesBtn)

    const installButtons = screen.getAllByRole('button', { name: /toggle installation for/i })
    await user.click(installButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesInstallPath: '/games/steam',
      })
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Installation Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('assigns path as Games Download folder (strictly limited to one)', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const rolesBtn = screen.getAllByRole('button', { name: /manage roles for/i })[0]
    await user.click(rolesBtn)

    // Click download button on /games/steam
    const downloadButtons = screen.getAllByRole('button', { name: /assign download for/i })
    await user.click(downloadButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.setDesktopSettings).toHaveBeenCalledWith({
        gamesDownloadPath: '/games/steam',
      })
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Games Directory Updated',
          variant: 'success',
        }),
      )
    })
  })

  it('assigns path as ISO folder via card button', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
    })

    const rolesBtn = screen.getAllByRole('button', { name: /manage roles for/i })[0]
    await user.click(rolesBtn)

    const isoButtons = screen.getAllByRole('button', { name: /toggle iso for/i })
    await user.click(isoButtons[0])

    await waitFor(() => {
      expect((window as any).desktopAPI.saveScanPaths).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: '/games/steam', type: 'iso' }),
        ]),
      )
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Assigned as ISO Folder',
          variant: 'success',
        }),
      )
    })
  })

  it('filters folders by search input', async () => {
    const user = userEvent.setup()
    renderSection()

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
      expect(screen.getByText('/isos/ps2')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Filter folders...')
    await user.type(searchInput, 'steam')

    await waitFor(() => {
      expect(screen.getByText('/games/steam')).toBeInTheDocument()
      expect(screen.queryByText('/isos/ps2')).not.toBeInTheDocument()
    })
  })

  it('renders scanned files quick summary and triggers organize navigation', async () => {
    const user = userEvent.setup()
    const onNavigateToOrganize = vi.fn()
    ;(window as any).desktopAPI.getLocalGames = vi.fn().mockResolvedValue([
      { id: '1', platform: 'pc', path: 'D:\\Games\\Hades (2020)\\hades.exe', otixMediaId: 'hades' },
      { id: '2', platform: 'pc', path: 'D:\\Downloads\\Unorganized Game\\setup.exe' },
    ])

    renderSection({ onNavigateToOrganize })

    expect(screen.getByText('Scanned Files Summary')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Total Files')).toBeInTheDocument()
      expect(screen.getByText('Organized')).toBeInTheDocument()
      expect(screen.getByText('Pending Organize')).toBeInTheDocument()
    })

    const organizeBtn = screen.getByRole('button', { name: /organize rules/i })
    await user.click(organizeBtn)
    expect(onNavigateToOrganize).toHaveBeenCalled()
  })
})
