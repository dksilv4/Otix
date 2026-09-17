import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsIntegrationsPage } from '../pages/settings-integrations-page'

// Mock API and auth
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        providers: [],
      },
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
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
  useLocation: () => ({ href: '/settings/integrations' }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

// Mock downloads & servers hooks
let mockGameServers: Array<{ id: number; name: string; primaryUrl: string; isOnline: boolean }> = []
let mockUsenetConfig: any = null
let mockRadarrConfig: any = null
let mockSonarrConfig: any = null

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

  it('opens SABnzbd modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    })

    const card = screen.getByText('SABnzbd').closest('.rounded-2xl')!
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
      expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    })
  })

  it('opens Prowlarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Prowlarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Prowlarr').closest('.rounded-2xl')!
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    })
  })

  it('opens Radarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Radarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Radarr').closest('.rounded-2xl')!
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Radarr' })).toBeInTheDocument()
      expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    })
  })

  it('opens Sonarr modal via modal framework even when no server is connected', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sonarr')).toBeInTheDocument()
    })

    const card = screen.getByText('Sonarr').closest('.rounded-2xl')!
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Sonarr' })).toBeInTheDocument()
      expect(screen.getByText('No Game Server Connected')).toBeInTheDocument()
    })
  })

  it('passes server details to the modal when an active server is connected', async () => {
    mockGameServers = [
      { id: 99, name: 'Homelab Alpha', primaryUrl: 'http://192.168.1.50:8000', isOnline: true },
    ]
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    })

    const card = screen.getByText('SABnzbd').closest('.rounded-2xl')!
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
      expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    })

    // Click on SABnzbd card header to expand it
    const sabnzbdCard = screen.getByText('SABnzbd').closest('.rounded-2xl')!
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
      expect(screen.getByText('Prowlarr')).toBeInTheDocument()
    })

    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl')!
    await user.click(within(prowlarrCard).getByRole('button'))

    const protocolGroup = await within(prowlarrCard).findByRole('group', { name: /Protocol/i })
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
      expect(screen.getByText('Radarr')).toBeInTheDocument()
    })

    // Test Radarr modal with server connected
    const radarrCard = screen.getByText('Radarr').closest('.rounded-2xl')!
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
    const sonarrCard = screen.getByText('Sonarr').closest('.rounded-2xl')!
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
    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl')!
    const prowlarrConnectBtn = within(prowlarrCard).getByRole('button', { name: /connect/i })
    await user.click(prowlarrConnectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix Node One/i)).toBeInTheDocument()
    })
  })
})

