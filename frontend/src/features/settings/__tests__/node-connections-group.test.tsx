import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { NodeConnectionsGroup } from '../components/organisms/node-connections-group'
import type { GameServer } from '@/features/downloads/use-server-downloads'

let mockGameServers: GameServer[] = []
let mockUsenetConfig: Record<string, unknown> | null = null
let mockRadarrConfig: Record<string, unknown> | null = null
let mockSonarrConfig: Record<string, unknown> | null = null
let mockProviders: Record<string, unknown> | null = null

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockGameServers, isLoading: false }),
  useNodes: () => ({ data: mockGameServers, isLoading: false }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
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

vi.mock('@/features/downloads/use-server-providers', () => ({
  useServerProviders: () => ({ data: mockProviders, isLoading: false }),
  useNodeProviders: () => ({ data: mockProviders, isLoading: false }),
}))

describe('NodeConnectionsGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGameServers = [defaultServer]
    mockUsenetConfig = null
    mockRadarrConfig = null
    mockSonarrConfig = null
    mockProviders = null
  })

  const renderGroup = (server: GameServer, defaultExpanded = true) => {
    mockGameServers = [server]
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <NodeConnectionsGroup server={server} defaultExpanded={defaultExpanded} />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )
  }

  const defaultServer: GameServer = {
    id: 1,
    name: 'Home Server',
    primaryUrl: 'http://192.168.1.100:8090',
    isOnline: true,
  }

  it('renders integration cards including SABnzbd, Prowlarr, Radarr, and Sonarr', () => {
    renderGroup(defaultServer)

    expect(screen.getByText('Home Server')).toBeInTheDocument()
    expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    expect(screen.getByText('Prowlarr')).toBeInTheDocument()
    expect(screen.getByText('Radarr')).toBeInTheDocument()
    expect(screen.getByText('Sonarr')).toBeInTheDocument()
  })

  it('opens SABnzbd modal via modal framework for connected node', async () => {
    const user = userEvent.setup()
    renderGroup(defaultServer)

    const card = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'SABnzbd' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Home Server/i)).toBeInTheDocument()
    })
  })

  it('opens Prowlarr modal via modal framework for connected node', async () => {
    const user = userEvent.setup()
    renderGroup(defaultServer)

    const card = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Home Server/i)).toBeInTheDocument()
    })
  })

  it('opens Radarr modal via modal framework for connected node', async () => {
    const user = userEvent.setup()
    renderGroup(defaultServer)

    const card = screen.getByText('Radarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Radarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Home Server/i)).toBeInTheDocument()
    })
  })

  it('opens Sonarr modal via modal framework for connected node', async () => {
    const user = userEvent.setup()
    renderGroup(defaultServer)

    const card = screen.getByText('Sonarr').closest('.rounded-2xl') as HTMLElement
    const connectBtn = within(card).getByRole('button', { name: /connect/i })
    await user.click(connectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Sonarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Home Server/i)).toBeInTheDocument()
    })
  })

  it('passes server details to the modal when an active server is connected', async () => {
    const server: GameServer = {
      id: 99,
      name: 'Homelab Alpha',
      primaryUrl: 'http://192.168.1.50:8000',
      isOnline: true,
    }
    const user = userEvent.setup()
    renderGroup(server)

    const card = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
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
    const server: GameServer = {
      id: 42,
      name: 'Main Server',
      primaryUrl: 'http://10.0.0.5:8000',
      isOnline: true,
    }
    mockUsenetConfig = {
      sabnzbd: { host: 'localhost', port: 8080, apiKey: 'test-key', configured: true },
      prowlarr: { host: 'localhost', port: 9696, apiKey: 'test-key', configured: true },
    }
    mockRadarrConfig = { host: 'localhost', port: 7878, apiKey: 'test-key', configured: true }
    mockSonarrConfig = { host: 'localhost', port: 8989, apiKey: 'test-key', configured: true }

    const user = userEvent.setup()
    renderGroup(server)

    const sabnzbdCard = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement
    const sabHeader = within(sabnzbdCard).getByRole('button')
    await user.click(sabHeader)

    const sabDialog = await screen.findByRole('dialog')
    const configureSabBtn = await within(sabDialog).findByRole('button', { name: /Configure SABnzbd/i })
    await user.click(configureSabBtn)

    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog')
      const targetDialog = dialogs.find((d) => within(d).queryByRole('heading', { name: 'SABnzbd' }))
      expect(targetDialog).toBeDefined()
      expect(within(targetDialog!).getByText(/On Main Server/i)).toBeInTheDocument()
    })
  })

  it('shows the redesigned Prowlarr indexers panel on the expanded Integrations card', async () => {
    const server: GameServer = {
      id: 42,
      name: 'Main Server',
      primaryUrl: 'http://10.0.0.5:8000',
      isOnline: true,
    }
    mockUsenetConfig = {
      prowlarr: { host: 'localhost', port: 9696, apiKey: 'test-key', configured: true },
    }

    const user = userEvent.setup()
    renderGroup(server)

    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    await user.click(within(prowlarrCard).getByRole('button'))

    const prowlarrDialog = await screen.findByRole('dialog')
    const protocolGroup = (await within(prowlarrDialog).findByRole('group', { name: /Protocol/i })) as HTMLElement
    expect(within(protocolGroup).queryByRole('button', { name: /^Sync$/i })).not.toBeInTheDocument()
    const syncBtn = within(prowlarrDialog).getByRole('button', { name: /^Sync$/i })
    expect(syncBtn.className).toMatch(/bg-rose-500/)
    expect(within(prowlarrDialog).getByText('No indexers yet')).toBeInTheDocument()
    expect(within(prowlarrDialog).getByText(/Press Sync to pull indexers from Prowlarr/i)).toBeInTheDocument()
    expect(within(prowlarrDialog).getByRole('list', { name: /Indexer list/i })).toBeInTheDocument()
    expect(within(prowlarrDialog).queryByRole('button', { name: /^Console$/i })).not.toBeInTheDocument()

    await user.click(within(prowlarrDialog).getByRole('button', { name: /Configure Prowlarr/i }))
    await waitFor(() => {
      const dialogs = screen.getAllByRole('dialog')
      const targetDialog = dialogs.find((d) => within(d).queryByRole('heading', { name: 'Prowlarr' }))
      expect(targetDialog).toBeDefined()
      expect(within(targetDialog!).getByRole('button', { name: /^Console$/i, pressed: true })).toBeInTheDocument()
      expect(within(targetDialog!).getByRole('button', { name: /^PC$/i, pressed: true })).toBeInTheDocument()
      expect(within(targetDialog!).getByRole('button', { name: /^Test connection$/i })).toBeInTheDocument()
    })
  })

  it('displays active server details across Prowlarr, Radarr, and Sonarr modals', async () => {
    const server: GameServer = {
      id: 77,
      name: 'Otix Node One',
      primaryUrl: 'http://192.168.1.100:8000',
      isOnline: true,
    }
    const user = userEvent.setup()
    renderGroup(server)

    // Test Radarr modal with server connected
    const radarrCard = screen.getByText('Radarr').closest('.rounded-2xl') as HTMLElement
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
    const sonarrCard = screen.getByText('Sonarr').closest('.rounded-2xl') as HTMLElement
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
    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const prowlarrConnectBtn = within(prowlarrCard).getByRole('button', { name: /connect/i })
    await user.click(prowlarrConnectBtn)

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Prowlarr' })).toBeInTheDocument()
      expect(within(screen.getByRole('dialog')).getByText(/On Otix Node One/i)).toBeInTheDocument()
    })
  })

  it('renders Prowlarr and SABnzbd as Connected when configured with camelCase apiKey and configured flag', () => {
    const server: GameServer = {
      id: 8,
      name: 'Node ID:1',
      primaryUrl: 'http://127.0.0.1:8090',
      isOnline: true,
    }
    mockUsenetConfig = {
      prowlarr: { host: 'localhost', port: 9696, apiKey: 'dummy-prowlarr-key', configured: true },
      sabnzbd: { host: 'localhost', port: 8080, apiKey: 'dummy-sab-key', configured: true },
    }

    renderGroup(server)

    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const sabnzbdCard = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement

    expect(within(prowlarrCard).getByText('Connected')).toBeInTheDocument()
    expect(within(prowlarrCard).getByText(/Configured on Node ID:1/i)).toBeInTheDocument()
    expect(within(prowlarrCard).queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument()

    expect(within(sabnzbdCard).getByText('Connected')).toBeInTheDocument()
    expect(within(sabnzbdCard).getByText(/Configured on Node ID:1/i)).toBeInTheDocument()
    expect(within(sabnzbdCard).queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument()
  })

  it('renders Prowlarr and SABnzbd as Connected when reported as connected by node providers', () => {
    const server: GameServer = {
      id: 8,
      name: 'Node ID:1',
      primaryUrl: 'http://127.0.0.1:8090',
      isOnline: true,
    }
    mockProviders = {
      downloaders: [
        { name: 'sabnzbd', display_name: 'SABnzbd', type: 'downloader', configured: true, connected: true },
      ],
      indexers: [
        { name: 'prowlarr', display_name: 'Prowlarr', type: 'indexer', configured: true, connected: true },
      ],
    }

    renderGroup(server)

    const prowlarrCard = screen.getByText('Prowlarr').closest('.rounded-2xl') as HTMLElement
    const sabnzbdCard = screen.getByText('SABnzbd').closest('.rounded-2xl') as HTMLElement

    expect(within(prowlarrCard).getByText('Connected')).toBeInTheDocument()
    expect(within(sabnzbdCard).getByText('Connected')).toBeInTheDocument()
  })
})
