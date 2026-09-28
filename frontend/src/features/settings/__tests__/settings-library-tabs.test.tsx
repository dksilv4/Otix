import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsLibraryPage } from '../pages/settings-library-page'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { resolveLibrarySettingsTab } from '../components/organisms/settings-library-tab-utils'
import { clearDesktopAPICache } from '@/lib/desktop/api'

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
  Link: ({ children, to, params, hash, ...props }: any) => {
    let href = String(to ?? '')
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, String(value))
      }
    }
    if (hash) href = `${href}#${hash}`
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
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
  it('defaults empty and legacy hashes to catalog; maps #proposals onto proposals', () => {
    expect(resolveLibrarySettingsTab('')).toBe('catalog')
    expect(resolveLibrarySettingsTab(undefined)).toBe('catalog')
    expect(resolveLibrarySettingsTab('overview')).toBe('catalog')
    expect(resolveLibrarySettingsTab('#overview')).toBe('catalog')
    expect(resolveLibrarySettingsTab('games')).toBe('catalog')
    expect(resolveLibrarySettingsTab('library')).toBe('catalog')
    expect(resolveLibrarySettingsTab('catalog')).toBe('catalog')
    expect(resolveLibrarySettingsTab('#catalog')).toBe('catalog')
    expect(resolveLibrarySettingsTab('proposals')).toBe('proposals')
    expect(resolveLibrarySettingsTab('#proposals')).toBe('proposals')
    expect(resolveLibrarySettingsTab('paths')).toBe('catalog')
    expect(resolveLibrarySettingsTab('downloads')).toBe('catalog')
    expect(resolveLibrarySettingsTab('organize')).toBe('catalog')
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
    clearDesktopAPICache()
  })

  it('renders tablist and Catalog tab by default', async () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.getAllByRole('heading', { name: 'Library' }).length).toBeGreaterThan(0)
    expect(
      screen.getByText('Match titles to Otix metadata, review candidates, and manage providers.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Catalog' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Match Proposals' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Paths' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Downloads' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Organize' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument()
      expect(screen.getByText('Scan Folders')).toBeInTheDocument()
    })
  })

  it('provides direct link to scan folders on nodes', async () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await waitFor(() => {
      const scanLink = screen.getByRole('link', { name: /scan folders/i })
      expect(scanLink).toHaveAttribute('href', '/settings/nodes')
    })
  })

  it('does not keep a Paths tab on the library page', async () => {
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    expect(screen.queryByRole('tab', { name: 'Paths' })).not.toBeInTheDocument()
    expect(screen.queryByText('Managing node')).not.toBeInTheDocument()
  })

  it('redirects retired downloads hash to Nodes', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/nodes', replace: true })
    })
  })

  it('opens Match Proposals tab from #proposals hash', async () => {
    mockHash = '#proposals'
    render(
      <SettingsSaveProvider>
        <ModalProvider>
          <SettingsLibraryPage />
          <ModalRoot />
        </ModalProvider>
      </SettingsSaveProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Match Proposals' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
  })
})
