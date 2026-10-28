import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsNodeConnectionsPage } from '../pages/settings-node-connections-page'
import type { GameServer } from '@/features/downloads/types'

let mockAuthUser: any = { id: 1, email: 'test@example.com' }
let mockServers: GameServer[] = []
let mockSelectedNodeId: number | null = 1
const mockSetSelectedNodeId = vi.fn((id: number | null) => {
  mockSelectedNodeId = id
})

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: Boolean(mockAuthUser),
    isLoading: false,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, hash, ...props }: any) => (
    <a href={`${to}${hash ? `#${hash}` : ''}`} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ nodeId: '1' }),
  useLocation: () => ({ hash: '#connections', pathname: '/settings/nodes' }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('../context/settings-node-context', () => ({
  useSettingsNode: () => ({
    servers: mockServers,
    selectedNode: mockServers.find((s) => s.id === mockSelectedNodeId) || mockServers[0] || null,
    selectedNodeId: mockSelectedNodeId,
    setSelectedNodeId: mockSetSelectedNodeId,
    isLoading: false,
  }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({
    config: {
      downloadPath: 'D:\\Downloads',
    },
    saveConfig: vi.fn(),
  }),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerRadarrConfig: () => ({ data: { host: 'http://localhost:7878', configured: true }, isLoading: false }),
  useServerRadarrMovies: () => ({ data: [], isLoading: false }),
  useServerRadarrQueue: () => ({ data: null, isLoading: false }),
  useServerSonarrConfig: () => ({ data: { host: 'http://localhost:8989', configured: true }, isLoading: false }),
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
  useServerUsenetConfig: () => ({
    data: {
      sabnzbd: { host: 'http://localhost:8080', configured: true },
      prowlarr: { host: 'http://localhost:9696', configured: true },
    },
    isLoading: false,
  }),
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
  useServerProviders: () => ({
    data: {
      downloaders: [{ name: 'sabnzbd', configured: true }],
      indexers: [{ name: 'prowlarr', configured: true }],
    },
    isLoading: false,
  }),
  useNodeProviders: () => ({ data: null, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: mockServers, isLoading: false }),
  useNodes: () => ({ data: mockServers, isLoading: false }),
}))

describe('SettingsNodeConnectionsPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = { id: 1, email: 'test@example.com' }
    mockSelectedNodeId = 1
    mockServers = [
      {
        id: 1,
        name: 'Main Server',
        primaryUrl: 'http://192.168.1.100:8090',
        isOnline: true,
        isLocalDesktop: false,
      },
      {
        id: 2,
        name: 'Desktop Companion',
        primaryUrl: 'http://127.0.0.1:8090',
        isOnline: true,
        isLocalDesktop: true,
      },
    ]
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <SettingsNodeConnectionsPage />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>,
    )

  it('renders node connections page with header, switcher, and all 4 connection cards', () => {
    renderComponent()

    expect(screen.getByRole('heading', { name: 'Node Connections', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByText('Main Server').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    expect(screen.getByText('Prowlarr')).toBeInTheDocument()
    expect(screen.getByText('Radarr')).toBeInTheDocument()
    expect(screen.getByText('Sonarr')).toBeInTheDocument()
  })

  it('allows filtering connections by search query', async () => {
    renderComponent()

    const searchInput = screen.getByPlaceholderText(/search connections/i)
    await userEvent.type(searchInput, 'sabnzbd')

    expect(screen.getByText('SABnzbd')).toBeInTheDocument()
    expect(screen.queryByText('Prowlarr')).not.toBeInTheDocument()
    expect(screen.queryByText('Sonarr')).not.toBeInTheDocument()
  })

  it('renders locked state when user is not authenticated', () => {
    mockAuthUser = null
    renderComponent()

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument()
  })

  it('renders empty state when there are no connected nodes', () => {
    mockServers = []
    renderComponent()

    expect(screen.getByText(/no connected nodes/i)).toBeInTheDocument()
  })
})
