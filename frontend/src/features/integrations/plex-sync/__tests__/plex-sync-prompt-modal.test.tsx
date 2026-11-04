import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { showToast } from '@ui/molecules/toast'
import { apiClient } from '@/lib/api/client'
import { PlexSyncPromptModal } from '../components/plex-sync-prompt-modal'
import { triggerPlexSyncPrompt, executePlexSync } from '../utils/plex-sync'
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

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('PlexSyncPromptModal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
    vi.restoreAllMocks()
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

  it('closes modal immediately, shows starting toast, and runs sync in the background', async () => {
    let resolveSync: (val: any) => void = () => {}
    const syncPromise = new Promise((resolve) => {
      resolveSync = resolve
    })

    const executeSpy = vi.spyOn(plexSyncUtils, 'executePlexSync').mockReturnValue(syncPromise as any)

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

    // Modal closes immediately without waiting for sync to finish
    await waitFor(() => {
      expect(screen.queryByText('Welcome! Sync Plex Data?')).not.toBeInTheDocument()
    })

    // Feedback toast shown immediately
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Plex sync started',
        description: 'Syncing your Plex data in the background...',
      }),
    )

    expect(executeSpy).toHaveBeenCalledWith({
      syncWatchlist: true,
      syncWatched: true,
    })

    // Complete background sync
    await act(async () => {
      resolveSync({
        watchlist: { total: 5, matched: 4, seeded: 1 },
        watched: { total: 10, matched: 8, seeded: 2, episodes: 15 },
      })
    })

    // Final completion notification shown
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Plex sync complete',
        }),
      )
    })
  })

  it('executePlexSync runs watchlist and watched sync concurrently', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url.includes('watchlist')) {
        return { data: { total: 10, matched: 8, seeded: 2 } }
      }
      if (url.includes('watched')) {
        return { data: { total: 20, matched: 15, seeded: 5, episodes: 30 } }
      }
      return { data: {} }
    })

    const result = await executePlexSync({ syncWatchlist: true, syncWatched: true })

    expect(result.watchlist).toEqual({ total: 10, matched: 8, seeded: 2 })
    expect(result.watched).toEqual({ total: 20, matched: 15, seeded: 5, episodes: 30 })
    expect(apiClient.post).toHaveBeenCalledTimes(2)
  })

  it('executePlexSync returns partial results if one sync task fails', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url.includes('watchlist')) {
        return { data: { total: 10, matched: 8, seeded: 2 } }
      }
      if (url.includes('watched')) {
        throw new Error('Connection timeout')
      }
      return { data: {} }
    })

    const result = await executePlexSync({ syncWatchlist: true, syncWatched: true })

    expect(result.watchlist).toEqual({ total: 10, matched: 8, seeded: 2 })
    expect(result.watched).toBeUndefined()
  })
})
