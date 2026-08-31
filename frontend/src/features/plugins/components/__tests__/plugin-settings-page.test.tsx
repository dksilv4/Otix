import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PluginSettingsPage } from '../organisms/plugin-settings-page'
import type { PluginSettingsTab } from '@/features/_config/slots'

const api = {
  get: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  callData: vi.fn(),
  getStatus: vi.fn(),
  testConfig: vi.fn(),
}

vi.mock('@/features/plugins/api', () => ({
  getPluginAPI: () => api,
}))

vi.mock('@/features/_config/slots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/_config/slots')>()
  return {
    ...actual,
    useSlotData: () => ({
      data: {
        'syncplay:rooms': [
          { pluginId: 'otix-syncplay', label: 'SyncPlay', data: { widgets: [{ type: 'badge', props: { label: 'Room Active', variant: 'success' } }] } },
        ],
      },
      isLoading: false,
      error: null,
    }),
  }
})

const plugin = {
  id: 'otix-syncplay',
  name: 'SyncPlay',
  version: '1.0.0',
  description: 'Watch together',
  author: 'Otix',
  repository: '',
  status: 'enabled' as const,
  manifest: {
    name: 'SyncPlay',
    version: '1.0.0',
    description: 'Watch together',
    author: 'Otix',
    repository: '',
    min_app_version: '0.1.0',
    permissions: [],
    entry: { main: 'main.js' },
    config: {
      host: { type: 'string', label: 'Server Host' },
      port: { type: 'number', label: 'Port', default: 8080 },
      spotify_client_id: { type: 'string', label: 'Spotify Client ID', section: 'Spotify' },
      spotify_client_secret: { type: 'secret', label: 'Spotify Client Secret', section: 'Spotify' },
      google_client_id: { type: 'string', label: 'Google Client ID', section: 'Google' },
      google_client_secret: { type: 'secret', label: 'Google Client Secret', section: 'Google' },
      playlists: { type: 'list', label: 'Playlists' },
    },
  },
  installedAt: '',
}

const tab: PluginSettingsTab = {
  id: 'syncplay',
  label: 'SyncPlay',
  icon: 'play',
  path: '/settings/syncplay',
  pluginId: 'otix-syncplay',
  sections: [
    { id: 'config', label: 'Settings', slot: '', config: true },
    { id: 'rooms', label: 'Rooms', slot: 'syncplay:rooms' },
  ],
}

const syncTab: PluginSettingsTab = {
  id: 'syncplay',
  label: 'SyncPlay',
  icon: 'play',
  path: '/settings/syncplay',
  pluginId: 'otix-syncplay',
  sections: [{ id: 'sync', label: 'Sync', slot: '', sync: true }],
}

const spotifyCard = () => within(screen.getByTestId('auth-card-spotify'))
const googleCard = () => within(screen.getByTestId('auth-card-google'))

describe('PluginSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(plugin)
    api.getConfig.mockResolvedValue({})
    api.getStatus.mockResolvedValue({
      connected: false,
      spotify: 'not connected',
      google: 'not connected',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the tab label and section tabs', async () => {
    render(<PluginSettingsPage tab={tab} />)
    expect(screen.getByText('SyncPlay')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Rooms')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('auth-card-spotify')).toBeInTheDocument())
  })

  it('renders a config-bound section as a form', async () => {
    api.getConfig.mockResolvedValue({ host: 'localhost' })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(screen.getByLabelText(/Server Host/)).toBeInTheDocument())
    expect(screen.getByLabelText(/Server Host/)).toHaveValue('localhost')
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('saves config changes through setConfig', async () => {
    api.getConfig.mockResolvedValue({ host: 'localhost' })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(screen.getByLabelText(/Server Host/)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/Server Host/), { target: { value: 'otix.local' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(api.setConfig).toHaveBeenCalledWith('otix-syncplay', 'host', 'otix.local'))
  })

  it('keeps provider credential fields out of the general config form', async () => {
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(screen.getByLabelText(/Server Host/)).toBeInTheDocument())
    const form = within(screen.getByTestId('config-form'))
    expect(form.queryByLabelText(/Spotify Client ID/)).not.toBeInTheDocument()
    expect(form.queryByLabelText(/Google Client ID/)).not.toBeInTheDocument()
  })

  it('keeps credentials hidden until revealed', async () => {
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Configure credentials')).toBeInTheDocument())
    expect(spotifyCard().queryByLabelText(/Spotify Client ID/)).not.toBeInTheDocument()
    fireEvent.click(spotifyCard().getByText('Configure credentials'))
    expect(spotifyCard().getByLabelText(/Spotify Client ID/)).toBeInTheDocument()
  })

  it('renders provider credentials inside each auth card when revealed', async () => {
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Configure credentials')).toBeInTheDocument())
    fireEvent.click(spotifyCard().getByText('Configure credentials'))
    fireEvent.click(googleCard().getByText('Configure credentials'))
    expect(spotifyCard().getByLabelText(/Spotify Client ID/)).toBeInTheDocument()
    expect(spotifyCard().getByLabelText(/Spotify Client Secret/)).toBeInTheDocument()
    expect(googleCard().getByLabelText(/Google Client ID/)).toBeInTheDocument()
    expect(googleCard().getByLabelText(/Google Client Secret/)).toBeInTheDocument()
  })

  it('saves a provider credential edit through setConfig', async () => {
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Configure credentials')).toBeInTheDocument())
    fireEvent.click(spotifyCard().getByText('Configure credentials'))
    fireEvent.change(spotifyCard().getByLabelText(/Spotify Client ID/), { target: { value: 'abc123' } })

    await waitFor(() => expect(api.setConfig).toHaveBeenCalledWith('otix-syncplay', 'spotify_client_id', 'abc123'))
  })

  it('switches to a slot section and renders slot contributions', async () => {
    render(<PluginSettingsPage tab={tab} />)
    fireEvent.click(screen.getByText('Rooms'))
    expect(screen.getByText('Room Active')).toBeInTheDocument()
  })

  it('renders an empty state without a tab', () => {
    render(<PluginSettingsPage />)
    expect(screen.getByText('No plugin settings available.')).toBeInTheDocument()
  })

  it('surfaces an already-connected Google + Spotify account on their cards', async () => {
    api.getStatus.mockResolvedValue({
      connected: true,
      authenticated: true,
      displayName: 'Spotify ✓ · YouTube ✓ (Otix)',
      spotify: 'connected',
      google: 'connected',
      google_source: 'Otix account',
      message: 'Ready to sync — mappings enabled',
    })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Connected')).toBeInTheDocument())
    expect(googleCard().getByText('Connected')).toBeInTheDocument()
    expect(googleCard().getByText('Otix account')).toBeInTheDocument()
  })

  it('shows a not-connected state when status reports no Google link', async () => {
    api.getStatus.mockResolvedValue({
      connected: false,
      spotify: 'connected',
      google: 'not connected',
      google_source: 'not connected',
    })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Connected')).toBeInTheDocument())
    expect(googleCard().getByText('Not connected')).toBeInTheDocument()
    expect(googleCard().getByText('Sign in to Google')).toBeInTheDocument()
  })

  it('explains a disconnected state with creds state and google error', async () => {
    api.getStatus.mockResolvedValue({
      connected: false,
      spotify: 'not connected',
      spotify_creds: 'valid',
      google: 'not connected',
      google_source: 'not connected',
      google_error: 'API GET /auth/oauth/google/token returned 401',
      message: 'Spotify creds saved — sign in to Spotify below',
    })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('valid')).toBeInTheDocument())
    expect(googleCard().getByText(/returned 401/)).toBeInTheDocument()
    expect(spotifyCard().getByText('Sign in to Spotify')).toBeInTheDocument()
  })

  it('runs the per-provider sign-in flow on the Spotify card', async () => {
    api.getStatus.mockResolvedValue({
      connected: false,
      spotify: 'not connected',
      google: 'not connected',
    })
    api.callData
      .mockResolvedValueOnce({ url: 'https://accounts.spotify.com/authorize?x=1', redirectPattern: '127.0.0.1:8765', tokenExtraction: { type: 'url-param' } })
      .mockResolvedValueOnce({ success: true, provider: 'spotify' })
    ;(window as any).desktopAPI = { plugin: { openOAuthWindow: vi.fn().mockResolvedValue({ success: true, code: 'auth-code' }) } }

    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Sign in to Spotify')).toBeInTheDocument())
    fireEvent.click(spotifyCard().getByText('Sign in to Spotify'))

    await waitFor(() => {
      expect(api.callData).toHaveBeenCalledWith('otix-syncplay', 'auth.getLoginUrl', 'spotify')
      expect((window as any).desktopAPI.plugin.openOAuthWindow).toHaveBeenCalledWith(
        'https://accounts.spotify.com/authorize?x=1',
        '127.0.0.1:8765',
        { tokenExtraction: { type: 'url-param' } },
      )
      expect(api.callData).toHaveBeenCalledWith('otix-syncplay', 'auth.handleCallback', 'auth-code')
    })
  })

  it('runs the per-provider sign-in flow on the Google card', async () => {
    api.getStatus.mockResolvedValue({
      connected: false,
      spotify: 'not connected',
      google: 'not connected',
    })
    api.callData
      .mockResolvedValueOnce({ url: 'https://accounts.google.com/o/oauth2/auth?y=1', redirectPattern: 'auth/callback/google', tokenExtraction: { type: 'url-param' } })
      .mockResolvedValueOnce({ success: true, provider: 'google' })
    ;(window as any).desktopAPI = { plugin: { openOAuthWindow: vi.fn().mockResolvedValue({ success: true, code: 'google-code' }) } }

    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(googleCard().getByText('Sign in to Google')).toBeInTheDocument())
    fireEvent.click(googleCard().getByText('Sign in to Google'))

    await waitFor(() => {
      expect(api.callData).toHaveBeenCalledWith('otix-syncplay', 'auth.getLoginUrl', 'google')
      expect(api.callData).toHaveBeenCalledWith('otix-syncplay', 'auth.handleCallback', 'google-code')
    })
  })

  it('surfaces a sign-in failure message on the card', async () => {
    api.getStatus.mockResolvedValue({ connected: false, spotify: 'not connected', google: 'not connected' })
    api.callData.mockResolvedValueOnce({ url: null, error: 'Configure your Spotify Client ID and Secret in settings first.' })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Sign in to Spotify')).toBeInTheDocument())
    fireEvent.click(spotifyCard().getByText('Sign in to Spotify'))

    await waitFor(() =>
      expect(spotifyCard().getByText('Configure your Spotify Client ID and Secret in settings first.')).toBeInTheDocument(),
    )
  })

  it('tests Spotify credentials through testConfig', async () => {
    api.getStatus.mockResolvedValue({ connected: false, spotify: 'not connected', google: 'not connected' })
    api.getConfig.mockResolvedValue({ spotify_client_id: 'abc' })
    api.testConfig.mockResolvedValue({ success: true, message: 'Spotify credentials OK · YouTube connected' })
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(spotifyCard().getByText('Test credentials')).toBeInTheDocument())
    fireEvent.click(spotifyCard().getByText('Test credentials'))

    await waitFor(() => {
      expect(api.testConfig).toHaveBeenCalledWith('otix-syncplay', expect.objectContaining({ spotify_client_id: 'abc' }))
      expect(spotifyCard().getByText('Spotify credentials OK · YouTube connected')).toBeInTheDocument()
    })
  })

  it('renders no auth cards when getStatus fails', async () => {
    api.getStatus.mockRejectedValue(new Error('no status'))
    render(<PluginSettingsPage tab={tab} />)

    await waitFor(() => expect(screen.getByLabelText(/Server Host/)).toBeInTheDocument())
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument()
  })

  it('renders a sync section as a SyncCard with a Sync now button', async () => {
    api.callData.mockImplementation((_id: string, method: string) =>
      method === 'sync.status' ? Promise.resolve({ phase: 'idle', last: null }) : Promise.resolve({}),
    )
    render(<PluginSettingsPage tab={syncTab} />)

    await waitFor(() => expect(screen.getByText('Sync to Otix')).toBeInTheDocument())
    expect(screen.getByText('Sync now')).toBeInTheDocument()
  })

  it('shows real-time progress while syncing, then per-playlist results', async () => {
    let resolveSyncNow: (v: Record<string, unknown>) => void = () => {}
    const syncNowPromise = new Promise<Record<string, unknown>>((r) => { resolveSyncNow = r })
    let syncDone = false
    const runningStatus = {
      phase: 'running',
      current: 1,
      total: 2,
      playlistTitle: 'My Mix',
      track: 3,
      trackTotal: 10,
      lastTrack: 'Some Song',
    }
    const doneStatus = { phase: 'done', last: null }
    api.callData.mockImplementation((_id: string, method: string) => {
      if (method === 'sync.status') return Promise.resolve(syncDone ? doneStatus : runningStatus)
      if (method === 'sync.now') return syncNowPromise
      return Promise.resolve({})
    })

    vi.useFakeTimers()
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(screen.getByText('Sync now'))
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    expect(screen.getByText(/Syncing playlist 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText('→ My Mix')).toBeInTheDocument()
    expect(screen.getByText(/Track 3 of 10/)).toBeInTheDocument()
    expect(screen.getByText('Some Song')).toBeInTheDocument()

    resolveSyncNow({
      success: true,
      added: 4,
      skipped: 1,
      pruned: 0,
      unmatched: 1,
      errorCount: 0,
      results: [
        { ok: true, title: 'My Mix', added: 4, skipped: 1, pruned: 0, unmatched: [{ name: 'X' }], errors: [] },
        { ok: true, title: 'Chill', upToDate: true, added: 0, skipped: 0 },
      ],
    })
    syncDone = true
    await act(async () => {})

    expect(screen.getByText('Sync complete')).toBeInTheDocument()
    expect(screen.getByText('My Mix')).toBeInTheDocument()
    expect(screen.getByText('+4 added')).toBeInTheDocument()
    expect(screen.getByText('Chill')).toBeInTheDocument()
    expect(screen.getByText('up to date')).toBeInTheDocument()
  })

  it('surfaces a sync error from sync.now', async () => {
    api.callData.mockImplementation((_id: string, method: string) =>
      method === 'sync.status'
        ? Promise.resolve({ phase: 'idle', last: null })
        : Promise.resolve({ success: false, error: 'No playlists configured. Add a playlist mapping in settings.' }),
    )
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(await screen.findByText('Sync now'))
    await waitFor(() => expect(screen.getByText('Sync failed')).toBeInTheDocument())
    expect(screen.getByText('No playlists configured. Add a playlist mapping in settings.')).toBeInTheDocument()
  })

  it('shows a paused banner when sync.now pauses for network loss', async () => {
    api.callData.mockImplementation((_id: string, method: string) => {
      if (method === 'sync.status') return Promise.resolve({ phase: 'paused', paused: true, deferred: 3, last: null })
      if (method === 'sync.now') {
        return Promise.resolve({
          success: false,
          paused: true,
          deferred: 3,
          error: 'Network unreachable — sync paused, 3 queued',
        })
      }
      return Promise.resolve({})
    })
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(await screen.findByText('Sync now'))
    await waitFor(() => expect(screen.getByText(/Sync paused — offline/)).toBeInTheDocument())
    expect(screen.getByText(/3 movie\(s\) queued/)).toBeInTheDocument()
    expect(screen.queryByText('Sync failed')).not.toBeInTheDocument()
    expect(screen.queryByText('Network unreachable — sync paused, 3 queued')).not.toBeInTheDocument()
  })

  it('loads the Spotify playlist list into a picker', async () => {
    api.callData.mockImplementation((_id: string, method: string) => {
      if (method === 'spotify.listPlaylists') {
        return Promise.resolve({
          success: true,
          playlists: [
            { id: 'p1', name: 'Chill', tracks: 42, public: true },
            { id: 'p2', name: 'Workout', tracks: 7, public: true },
          ],
        })
      }
      return Promise.resolve({})
    })
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(await screen.findByText('Load my Spotify playlists'))
    await waitFor(() => expect(screen.getByLabelText('Spotify playlist')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: /Chill \(42 tracks\)/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Workout \(7 tracks\)/ })).toBeInTheDocument()
  })

  it('adds a playlist mapping from the picker via setConfig', async () => {
    api.callData.mockImplementation((_id: string, method: string) => {
      if (method === 'spotify.listPlaylists') {
        return Promise.resolve({ success: true, playlists: [{ id: 'p1', name: 'Chill', tracks: 42, public: true }] })
      }
      return Promise.resolve({})
    })
    api.getConfig.mockResolvedValue({ playlists: [{ source: 'liked', yt_title: 'Spotify', enabled: true }] })
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(await screen.findByText('Load my Spotify playlists'))
    fireEvent.change(await screen.findByLabelText('Spotify playlist'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('YouTube Music playlist title'), { target: { value: 'Chill on YT' } })
    fireEvent.click(screen.getByText('Add mapping'))

    await waitFor(() => {
      expect(api.setConfig).toHaveBeenCalledWith(
        'otix-syncplay',
        'playlists',
        expect.arrayContaining([
          expect.objectContaining({ source: 'playlist', spotify_playlist: 'p1', yt_title: 'Chill on YT', enabled: true }),
        ]),
      )
    })
    const arg = api.setConfig.mock.calls.find((c) => c[1] === 'playlists')?.[2] as unknown[]
    expect(arg[0]).toEqual({ source: 'liked', yt_title: 'Spotify', enabled: true })
  })

  it('shows an error state when the playlist list fails to load', async () => {
    api.callData.mockImplementation((_id: string, method: string) => {
      if (method === 'spotify.listPlaylists') {
        return Promise.resolve({ success: false, error: 'Spotify list failed (HTTP 403)' })
      }
      return Promise.resolve({})
    })
    render(<PluginSettingsPage tab={syncTab} />)

    fireEvent.click(await screen.findByText('Load my Spotify playlists'))
    await waitFor(() => expect(screen.getByText(/HTTP 403/)).toBeInTheDocument())
    expect(screen.getByText('Retry loading playlists')).toBeInTheDocument()
  })
})
