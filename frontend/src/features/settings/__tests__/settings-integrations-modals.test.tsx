import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
  useNavigate: () => vi.fn(),
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

const mockProviders: Record<string, unknown> | null = null
vi.mock('@/features/downloads/use-server-providers', () => ({
  useServerProviders: () => ({ data: mockProviders, isLoading: false }),
  useNodeProviders: () => ({ data: mockProviders, isLoading: false }),
}))

describe('Settings Integrations Modals Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        providers: [],
      },
    })
    mockGameServers = [
      { id: 1, name: 'Home Server', primaryUrl: 'http://192.168.1.100:8090', isOnline: true },
    ]
    mockUsenetConfig = null
    mockRadarrConfig = null
    mockSonarrConfig = null
  })

  const renderPage = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <SettingsIntegrationsPage />
          <ModalRoot />
        </ModalProvider>
      </QueryClientProvider>
    )
  }



  it('renders connection cards immediately even if oauth status never returns', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}))

    renderPage()

    expect(screen.queryByText('Loading integrations...')).not.toBeInTheDocument()
    expect(screen.getByText('Steam')).toBeInTheDocument()
    expect(screen.getByText('Plex')).toBeInTheDocument()
  })

  it('renders accounts and services sections', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Services & Storage' })).toBeInTheDocument()
    })
    expect(document.getElementById('accounts')).toBeTruthy()
    expect(document.getElementById('services')).toBeTruthy()
    expect(document.getElementById('accounts')!.contains(screen.getByText('Steam'))).toBe(true)
    expect(document.getElementById('accounts')!.contains(screen.getByText('Google'))).toBe(true)
    expect(document.getElementById('services')!.contains(screen.getByText('YouTube'))).toBe(true)
    expect(document.getElementById('services')!.contains(screen.getByText('Google Drive'))).toBe(true)
  })

  it('renders Epic Games as a first-class connection card under accounts', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Epic Games')).toBeInTheDocument()
    })

    const accountsSection = document.getElementById('accounts')!
    expect(within(accountsSection).getByText('Epic Games')).toBeInTheDocument()
    expect(
      screen.getByText('Sign in with Epic Games to sync your game library.'),
    ).toBeInTheDocument()

    const epicCard = screen.getByText('Epic Games').closest('.rounded-2xl') as HTMLElement
    expect(within(epicCard).getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('renders connected Epic Games card with profile and scan action', async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (String(url).includes('/integrations/epic/status')) {
        return Promise.resolve({
          data: {
            connected: true,
            displayName: 'EpicGamer123',
            accountId: 'epic-acc-999',
          },
        })
      }
      return Promise.resolve({
        data: {
          providers: [
            {
              name: 'epic',
              connected: true,
              epicDisplayName: 'EpicGamer123',
              epicAccountId: 'epic-acc-999',
            },
          ],
        },
      })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Linked as EpicGamer123')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText('Linked as EpicGamer123'))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(within(dialog).getByText('Account ID: epic-acc-999')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /scan library/i })).toBeInTheDocument()
    })
  })
})


