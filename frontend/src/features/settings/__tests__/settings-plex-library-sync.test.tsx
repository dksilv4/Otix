import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, ModalRoot } from '@/lib/modals'
import { SettingsIntegrationsPage } from '../pages/settings-integrations-page'

const mockRefetchLibraries = vi.fn()
let mockLibraries: any[] = []
let mockStreamLibrarySyncImpl: any = vi.fn()

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/auth/oauth') {
        return Promise.resolve({
          data: {
            providers: [
              {
                name: 'plex',
                connected: true,
                plexId: 'plex-user-123',
                plexUsername: 'PlexTester',
                plexEmail: 'tester@plex.tv',
                plexThumb: null,
              },
            ],
          },
        })
      }
      return Promise.resolve({ data: {} })
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'tester@example.com', plexId: 'plex-user-123' },
    isAuthenticated: true,
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ href: '/settings/connections' }),
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@library/library-queries', () => ({
  usePlexLibraries: () => ({
    data: mockLibraries,
    isLoading: false,
    refetch: mockRefetchLibraries,
  }),
  streamPlexLibrarySync: (...args: any[]) => mockStreamLibrarySyncImpl(...args),
}))

vi.mock('@/features/downloads/use-server-downloads', () => ({
  useGameServers: () => ({ data: [], isLoading: false }),
}))

vi.mock('@/features/downloads/use-downloads', () => ({
  useDownloadConfig: () => ({ config: null, isLoading: false }),
}))

vi.mock('@/features/downloads/use-server-arr', () => ({
  useServerRadarrConfig: () => ({ data: null, isLoading: false }),
  useServerRadarrMovies: () => ({ data: [], isLoading: false }),
  useServerRadarrQueue: () => ({ data: null, isLoading: false }),
  useServerSonarrConfig: () => ({ data: null, isLoading: false }),
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
  useServerUsenetConfig: () => ({ data: null, isLoading: false }),
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
  useServerProviders: () => ({ data: null, isLoading: false }),
  useNodeProviders: () => ({ data: null, isLoading: false }),
}))

describe('Plex Library Sync and Error Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLibraries = [
      {
        id: 'lib-1',
        serverId: 'srv-1',
        serverName: 'MainServer',
        sectionKey: '1',
        title: 'Main Movies',
        libraryType: 'movie',
        selected: true,
        itemCount: 150,
        lastSyncedAt: null,
      },
      {
        id: 'lib-2',
        serverId: 'srv-1',
        serverName: 'MainServer',
        sectionKey: '2',
        title: 'Main TV Shows',
        libraryType: 'show',
        selected: true,
        itemCount: 80,
        lastSyncedAt: null,
      },
    ]
  })

  function renderPage() {
    return render(
      <ModalProvider>
        <SettingsIntegrationsPage />
        <ModalRoot />
      </ModalProvider>
    )
  }

  it('shows progress bar ONLY for the library being synced, not other libraries', async () => {
    let onEventCallback: ((event: any) => void) | undefined
    mockStreamLibrarySyncImpl = vi.fn((_libId: string, onEvent: any) => {
      onEventCallback = onEvent
      return new Promise(() => {}) // keep in progress
    })

    const user = userEvent.setup()
    renderPage()

    // Wait for Plex to be connected
    await waitFor(() => {
      expect(screen.getByText('Plex')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    const plexTitle = screen.getByText('Plex')
    const plexHeader = plexTitle.closest('[role="button"]')
    expect(plexHeader).not.toBeNull()
    await user.click(plexHeader!)

    await waitFor(() => {
      expect(screen.getByText('Main Movies')).toBeInTheDocument()
      expect(screen.getByText('Main TV Shows')).toBeInTheDocument()
    })

    const moviesCard = screen.getByText('Main Movies').closest('.rounded-xl') as HTMLElement
    const tvCard = screen.getByText('Main TV Shows').closest('.rounded-xl') as HTMLElement

    const syncMoviesBtn = within(moviesCard).getByRole('button', { name: /sync/i })
    await user.click(syncMoviesBtn)

    // Simulate progress on Movies library
    onEventCallback?.({
      type: 'syncing_library',
      itemsTotal: 100,
    })
    onEventCallback?.({
      type: 'library_progress',
      itemsProcessed: 45,
      itemsTotal: 100,
    })

    await waitFor(() => {
      // Movies card should have progress text and bar
      expect(within(moviesCard).getByText('Syncing items...')).toBeInTheDocument()
      expect(within(moviesCard).getByText('45 / 100')).toBeInTheDocument()

      // TV Shows card must NOT have any progress bar or syncing text
      expect(within(tvCard).queryByText('Syncing items...')).not.toBeInTheDocument()
    })
  })

  it('displays scan error directly on the individual library card instead of bottom of integration card', async () => {
    mockStreamLibrarySyncImpl = vi.fn().mockRejectedValue(new Error('Connection to server timed out'))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Plex')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
    const plexHeader = screen.getByText('Plex').closest('[role="button"]') as HTMLElement
    await user.click(plexHeader)

    await waitFor(() => {
      expect(screen.getByText('Main Movies')).toBeInTheDocument()
    })

    const moviesCard = screen.getByText('Main Movies').closest('.rounded-xl') as HTMLElement
    const syncMoviesBtn = within(moviesCard).getByRole('button', { name: /sync/i })
    await user.click(syncMoviesBtn)

    await waitFor(() => {
      // Error message must appear inside the Movies library card
      expect(within(moviesCard).getByText('Connection to server timed out')).toBeInTheDocument()
    })

    // The error should appear inside the movies card and NOT in the global bottom section
    const fullPlexCard = screen.getByText('Plex').closest('.rounded-2xl') as HTMLElement
    const matchingErrors = within(fullPlexCard).getAllByText('Connection to server timed out')
    expect(matchingErrors).toHaveLength(1)
    expect(within(moviesCard).getByText('Connection to server timed out')).toBe(matchingErrors[0])
  })
})
