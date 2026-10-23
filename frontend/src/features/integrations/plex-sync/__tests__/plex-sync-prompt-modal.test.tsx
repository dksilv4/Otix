import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlexSyncPromptModal } from '../components/plex-sync-prompt-modal'
import { triggerPlexSyncPrompt } from '../utils/plex-sync'
import * as plexSyncUtils from '../utils/plex-sync'

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: 1, username: 'testuser' },
  }),
}))

vi.mock('@ui/molecules/toast', () => ({
  showToast: vi.fn(),
}))

describe('PlexSyncPromptModal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('renders closed initially when no pending prompt exists', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlexSyncPromptModal />
      </QueryClientProvider>,
    )

    expect(screen.queryByText(/Sync Plex Data/i)).not.toBeInTheDocument()
  })

  it('opens and renders options when triggerPlexSyncPrompt is invoked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlexSyncPromptModal />
      </QueryClientProvider>,
    )

    act(() => {
      triggerPlexSyncPrompt('link')
    })

    await waitFor(() => {
      expect(screen.getByText('Sync Plex Data')).toBeInTheDocument()
    })

    expect(screen.getByText('Watchlist')).toBeInTheDocument()
    expect(screen.getByText('Watched Media')).toBeInTheDocument()
    expect(screen.getByText('Not now')).toBeInTheDocument()
    expect(screen.getByText('Sync Selected')).toBeInTheDocument()
  })

  it('allows toggling sync options independently and closing with Not now', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlexSyncPromptModal />
      </QueryClientProvider>,
    )

    act(() => {
      triggerPlexSyncPrompt('link')
    })

    await waitFor(() => {
      expect(screen.getByText('Sync Plex Data')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const watchlistCb = checkboxes[0]
    const watchedCb = checkboxes[1]

    expect(watchlistCb.checked).toBe(true)
    expect(watchedCb.checked).toBe(true)

    // Toggle off watchlist
    fireEvent.click(watchlistCb)
    expect(watchlistCb.checked).toBe(false)
    expect(watchedCb.checked).toBe(true)

    // Click Not now
    fireEvent.click(screen.getByText('Not now'))
    await waitFor(() => {
      expect(screen.queryByText('Sync Plex Data')).not.toBeInTheDocument()
    })
  })

  it('calls executePlexSync and notifies on Sync Selected', async () => {
    const executeSpy = vi.spyOn(plexSyncUtils, 'executePlexSync').mockResolvedValueOnce({
      watchlist: { total: 5, matched: 4, seeded: 1 },
      watched: { total: 10, matched: 8, seeded: 2, episodes: 15 },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <PlexSyncPromptModal />
      </QueryClientProvider>,
    )

    act(() => {
      triggerPlexSyncPrompt('login')
    })

    await waitFor(() => {
      expect(screen.getByText('Welcome! Sync Plex Data?')).toBeInTheDocument()
    })

    const syncBtn = screen.getByText('Sync Selected')
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith({
        syncWatchlist: true,
        syncWatched: true,
      })
    })
  })
})
