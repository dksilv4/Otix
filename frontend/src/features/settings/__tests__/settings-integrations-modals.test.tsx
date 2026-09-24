import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsIntegrationsPage } from '../pages/settings-integrations-page'
import { apiClient } from '@/lib/api/client'

// Mock API and auth
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/integrations/epic/status')) {
        return Promise.resolve({ data: { connected: false } })
      }
      return Promise.resolve({
        data: {
          providers: [],
        },
      })
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ href: '/settings/connections' }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Mock downloads & servers hooks
let mockGameServers: Array<{ id: number; name: string; primaryUrl: string; isOnline: boolean }> = []
let mockUsenetConfig: Record<string, unknown> | null = null
let mockRadarrConfig: Record<string, unknown> | null = null
let mockSonarrConfig: Record<string, unknown> | null = null

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({ config: null, isLoading: false }),
}))

vi.mock('@library/library-queries', () => ({
  usePlexLibraries: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  streamPlexLibrarySync: vi.fn(),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerRadarrConfig: () => ({ data: mockRadarrConfig, isLoading: false }),
  useServerRadarrMovies: () => ({ data: [], isLoading: false }),
  useServerRadarrQueue: () => ({ data: null, isLoading: false }),
  useServerSonarrConfig: () => ({ data: mockSonarrConfig, isLoading: false }),
  useServerSonarrSeries: () => ({ data: [], isLoading: false }),
  useServerSonarrQueue: () => ({ data: null, isLoading: false }),
  useSaveServerRadarrConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestRadarr: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerSonarrConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestSonarr: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useServerRadarrQualityProfiles: () => ({ data: [], isLoading: false }),
  useServerRadarrProfiles: () => ({ data: [], isLoading: false }),
  useServerRadarrRootFolders: () => ({ data: [], isLoading: false }),
  useServerSonarrQualityProfiles: () => ({ data: [], isLoading: false }),
  useServerSonarrProfiles: () => ({ data: [], isLoading: false }),
  useServerSonarrRootFolders: () => ({ data: [], isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-usenet', () => ({
  useServerUsenetConfig: () => ({ data: mockUsenetConfig, isLoading: false }),
  useServerUsenetQueue: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
  usePauseSabnzbdQueue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResumeSabnzbdQueue: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProwlarrIndexers: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
  useSyncProwlarrIndexers: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerSabnzbdConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestSabnzbd: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerProwlarrConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestProwlarr: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('Settings Integrations Modals Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        providers: [],
      },
    })
    mockGameServers = []
    mockUsenetConfig = null
    mockRadarrConfig = null
    mockSonarrConfig = null
  })

  function renderPage() {
    return render(
      <ModalProvider>
        <SettingsIntegrationsPage />
        <ModalRoot />
      </ModalProvider>
    )
  }

  it('renders integration cards including SABnzbd, Prowlarr, Radarr, and Sonarr', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SABnzbd')).toBeInTheDocument()
      expect(screen.getByText('Prowlarr')).toBeInTheDocument()
      expect(screen.getByText('Radarr')).toBeInTheDocument()
      expect(screen.getByText('Sonarr')).toBeInTheDocument()
    })
  })

  it('renders connection cards immediately even if oauth status never returns', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.queryByText('Loading integrations...')).not.toBeInTheDocument()
    expect(screen.getByText('Steam')).toBeInTheDocument()
    expect(screen.getByText('Plex')).toBeInTheDocument()
  })

  it('puts connection nodes in a separate section from accounts', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Connection nodes' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(document.getElementById('accounts')).toBeTruthy()
    expect(document.getElementById('nodes')).toBeTruthy()
    expect(document.getElementById('nodes')!.contains(screen.getByText('SABnzbd'))).toBe(true)
    expect(document.getElementById('accounts')!.contains(screen.getByText('Steam'))).toBe(true)
  })

  it('opens SABnzbd modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    })

    const card = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix backend/i)).toBeInTheDocument()
    })
  })

  it('opens Prowlarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Prowlarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix backend/i)).toBeInTheDocument()
    })
  })

  it('opens Radarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Radarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Radarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Radarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix backend/i)).toBeInTheDocument()
    })
  })

  it('opens Sonarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sonarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Sonarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Sonarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix backend/i)).toBeInTheDocument()
    })
  })

  it('passes server details to the modal when an active server is connected', async () => {
    mockGameServers = [
      { id: 99, name: 'Homelab Alpha', primaryUrl: 'http://192.168.1.50:8000', isOnline: true },
    ]
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Homelab Alpha')).toBeInTheDocument()
    })

    const serverSection = screen.getByText('Homelab Alpha').closest('.overflow-hidden') as HTMLElement
    const card = within(serverSection).getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
      expect(within(dialog).getByText(/On Homelab Alpha/i)).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/URL Base/i)).toBeInTheDocument()
      expect(within(dialog).queryByText('Advanced')).not.toBeInTheDocument()
    })
  })

  it('opens modals from configured detail view via Configure buttons', async () => {
    mockGameServers = [
      { id: 42, name: 'Main Server', primaryUrl: 'http://10.0.0.5:8000', isOnline: true },
    ]
    mockUsenetConfig = {
      sabnzbd: { host: 'localhost', port: 8080, apiKey: 'test-key', configured: true },
      prowlarr: { host: 'localhost', port: 9696, apiKey: 'test-key', configured: true },
    }
    mockRadarrConfig = { host: 'localhost', port: 7878, apiKey: 'test-key', configured: true }
    mockSonarrConfig = { host: 'localhost', port: 8989, apiKey: 'test-key', configured: true }

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Main Server')).toBeInTheDocument()
    })

    const serverSection = screen.getByText('Main Server').closest('.overflow-hidden') as HTMLElement
    const sabnzbdCard = within(serverSection).getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
    const sabHeader = within(sabnzbdCard).getByRole('button')
    await user.click(sabHeader)

    // In expanded view, click "Configure SABnzbd"
    const configureSabBtn = await within(sabnzbdCard).findByRole('button', { name: /Configure SABnzbd/i })
    await user.click(configureSabBtn)

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
      expect(within(dialog).getByText(/On Main Server/i)).toBeInTheDocument()
    })
  })

  it('shows the redesigned Prowlarr indexers panel on the expanded Integrations card', async () => {
    mockGameServers = [
      { id: 42, name: 'Main Server', primaryUrl: 'http://10.0.0.5:8000', isOnline: true },
    ]
    mockUsenetConfig = {
      prowlarr: { host: 'localhost', port: 9696, apiKey: 'test-key', configured: true },
    }

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Main Server')).toBeInTheDocument()
    })

    const serverSection = screen.getByText('Main Server').closest('.overflow-hidden') as HTMLElement
    const prowlarrCard = within(serverSection).getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    await user.click(within(prowlarrCard).getByRole('button'))

    const protocolGroup = await within(prowlarrCard).findByRole('group', { name: /Protocol/i }) as HTMLElement
    expect(within(protocolGroup).queryByRole('button', { name: /^Sync$/i })).not.toBeInTheDocument()
    const syncBtn = within(prowlarrCard).getByRole('button', { name: /^Sync$/i })
    expect(syncBtn.className).toMatch(/bg-rose-500/)
    expect(within(prowlarrCard).getByText('No indexers yet')).toBeInTheDocument()
    expect(within(prowlarrCard).getByText(/Press Sync to pull indexers from Prowlarr/i)).toBeInTheDocument()
    expect(within(prowlarrCard).getByRole('list', { name: /Indexer list/i })).toBeInTheDocument()
    expect(within(prowlarrCard).queryByRole('button', { name: /^Console$/i })).not.toBeInTheDocument()

    await user.click(within(prowlarrCard).getByRole('button', { name: /Configure Prowlarr/i }))
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /^Console$/i, pressed: true })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /^PC$/i, pressed: true })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /^Test connection$/i })).toBeInTheDocument()
    })
  })

  it('displays active server details across Prowlarr, Radarr, and Sonarr modals', async () => {
    mockGameServers = [
      { id: 77, name: 'Otix Node One', primaryUrl: 'http://192.168.1.100:8000', isOnline: true },
    ]
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Otix Node One')).toBeInTheDocument()
    })

    const serverSection = screen.getByText('Otix Node One').closest('.overflow-hidden') as HTMLElement

    // Test Radarr modal with server connected
    const radarrCard = within(serverSection).getByText('Radarr').closest('.rounded-2xl') as HTMLElement
    const radarrConnectBtn = within(radarrCard).getByRole('button', { name: /connect/i })
    await user.click(radarrConnectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Radarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix Node One/i)).toBeInTheDocument()
    })

    // Dismiss with Escape key
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Test Sonarr modal with server connected
    const sonarrCard = within(serverSection).getByText('Sonarr').closest('.rounded-2xl') as HTMLElement
    const sonarrConnectBtn = within(sonarrCard).getByRole('button', { name: /connect/i })
    await user.click(sonarrConnectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Sonarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix Node One/i)).toBeInTheDocument()
    })

    // Dismiss with Escape key
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Test Prowlarr modal with server connected
    const prowlarrCard = within(serverSection).getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const prowlarrConnectBtn = within(prowlarrCard).getByRole('button', { name: /connect/i })
    await user.click(prowlarrConnectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix Node One/i)).toBeInTheDocument()
    })
  })

  it('disables Epic Connect and shows a hint when no Otix Server is online', async () => {
    mockGameServers = []
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Epic Games')).toBeInTheDocument()
    })

    const card = screen.getByText('Epic Games').closest('.rounded-2xl')!
    expect(within(card).getByRole('button', { name: /connect/i })).toBeDisabled()
    expect(within(card).getByText('Connect an Otix Server to link Epic.')).toBeInTheDocument()
  })

  it('enables Epic Connect when an Otix Server is online', async () => {
    mockGameServers = [
      { id: 1, name: 'Homelab', primaryUrl: 'http://192.168.1.10:8000', isOnline: true },
    ]
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Epic Games')).toBeInTheDocument()
    })

    const card = screen.getByText('Epic Games').closest('.rounded-2xl')!
    expect(within(card).getByRole('button', { name: /connect/i })).toBeEnabled()
  })
})

