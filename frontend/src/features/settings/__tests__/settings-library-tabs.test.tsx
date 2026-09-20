import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsLibraryPage } from '../pages/settings-library-page'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { resolveLibrarySettingsTab } from '../components/organisms/settings-library-tabs'

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

const mockNavigate = vi.fn()
let mockHash = ''
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ href: '/settings/library', hash: mockHash }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/features/plugins/api', () => ({
  getPluginAPI: () => null,
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: { items: [], hasMore: false } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      id: 'default',
      downloadPath: '/downloads',
      postProcessEnabled: true,
      autoSearchWishlist: false,
      wishlistIntervalHours: 12,
      allowHypervisor: false,
      autoOrganizeEnabled: false,
      namingTemplate: null,
      preferredRepackers: null,
    },
    saveConfig: vi.fn(),
    isLoading: false,
    updateConfig: { mutateAsync: vi.fn() },
  }),
  useDownloads: () => ({ downloads: [], isLoading: false, cancelDownload: vi.fn() }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
  useCreateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePingGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateGameServer: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({
    data: {
      sabnzbd: {
        host: '192.168.1.100',
        port: 8080,
        category: 'games',
        configured: true,
      },
    },
    isLoading: false,
  }),
  useTestSabnzbd: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerSabnzbdConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/proposals/pages/proposals-page', () => ({
  ProposalsPage: () => <div data-testid="proposals-page">Proposals Component</div>,
}))

vi.mock('../components/organisms/settings-free-games-section', () => ({
  SettingsFreeGamesSection: () => <div data-testid="free-games-section">Free Games</div>,
}))

describe('resolveLibrarySettingsTab', () => {
  it('defaults empty and overview to overview; maps legacy hashes onto library', () => {
    expect(resolveLibrarySettingsTab('')).toBe('overview')
    expect(resolveLibrarySettingsTab(undefined)).toBe('overview')
    expect(resolveLibrarySettingsTab('overview')).toBe('overview')
    expect(resolveLibrarySettingsTab('#overview')).toBe('overview')
    expect(resolveLibrarySettingsTab('games')).toBe('library')
    expect(resolveLibrarySettingsTab('#proposals')).toBe('library')
    expect(resolveLibrarySettingsTab('library')).toBe('library')
    expect(resolveLibrarySettingsTab('paths')).toBe('paths')
    expect(resolveLibrarySettingsTab('downloads')).toBe('downloads')
    expect(resolveLibrarySettingsTab('organize')).toBe('organize')
  })
})

describe('SettingsLibraryPage tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHash = ''
    ;(window as any).desktopAPI = {
      getScanPaths: vi.fn().mockResolvedValue([]),
      saveScanPaths: vi.fn().mockResolvedValue(undefined),
      scanPaths: vi.fn().mockResolvedValue([]),
      getDesktopSettings: vi.fn().mockResolvedValue({ gamesDownloadPath: '' }),
      saveDesktopSettings: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('renders tablist and Overview tab by default', async () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Library & Downloads' })).toBeInTheDocument()
    expect(
      screen.getByText('Status across matching, storage paths, game servers, and automation.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Paths' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Downloads' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Organize' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open Library settings' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open Paths settings' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open Downloads settings' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open Organize settings' })).toBeInTheDocument()
    })
  })

  it('navigates from overview card to Paths tab', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Paths settings' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Open Paths settings' }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/library', hash: 'paths', replace: true })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Scan folders' })).toBeInTheDocument()
    })
  })

  it('switches to Paths tab and updates hash', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Paths' }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/library', hash: 'paths', replace: true })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Scan folders' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Remote path mappings' })).not.toBeInTheDocument()
      expect(screen.getByText('Games download folder')).toBeInTheDocument()
      expect(screen.getByText('Scan folders')).toBeInTheDocument()
    })
  })

  it('opens Downloads tab content from hash', async () => {
    mockHash = '#downloads'
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Remote Game Servers')).toBeInTheDocument()
      expect(screen.getByText('Download clients')).toBeInTheDocument()
    })
  })

  it('opens Library tab from #library hash', async () => {
    mockHash = '#library'
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true')
    })
  })
})
