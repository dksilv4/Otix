// TODO: Review this file
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { useToast } from '@/features/dk-ui/molecules/toast'


interface SpotifyPlayerInstance {
  device_id: string
  connect: () => Promise<boolean>
  disconnect: () => void
  togglePlay: () => Promise<void>
  nextTrack: () => Promise<void>
  previousTrack: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  getCurrentState: () => Promise<PlaybackState | null>
  getVolume: () => Promise<number>
  setVolume: (vol: number) => Promise<void>
  addListener: <T = unknown>(event: string, cb: (data: T) => void) => boolean
  removeListener: <T = unknown>(event: string, cb?: (data: T) => void) => boolean
}

interface SpotifyPlayerOptions {
  name: string
  getOAuthToken: (cb: (token: string) => void) => void
  volume?: number
}

interface SpotifyWebPlaybackSdk {
  Player: new (options: SpotifyPlayerOptions) => unknown
}

declare global {
  interface Window {
    Spotify: SpotifyWebPlaybackSdk
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

interface PlaybackState {
  paused: boolean
  position: number
  duration: number
  track_window: {
    current_track: SpotifyTrack
    next_tracks: SpotifyTrack[]
    previous_tracks: SpotifyTrack[]
  }
}

interface SpotifyTrack {
  uri: string
  id: string
  name: string
  duration_ms: number
  artists: { name: string; uri: string }[]
  album: {
    name: string
    uri: string
    images: { url: string; height: number; width: number }[]
  }
}

export interface CurrentTrackInfo {
  id: string
  uri: string
  name: string
  artist: string
  artists: Array<{ name: string; uri: string }>
  albumName: string
  albumArt: string | null
  durationMs: number
}

export interface QueueTrack {
  uri: string
  id: string
  name: string
  artist: string
  albumArt: string | null
}

interface SpotifyPlayerContextValue {
  isReady: boolean
  isPlaying: boolean
  currentTrack: CurrentTrackInfo | null
  error: string | null
  position: number
  duration: number
  volume: number
  nextTracks: QueueTrack[]
  previousTracks: QueueTrack[]
  play: (spotifyUri: string) => Promise<void>
  togglePlay: () => Promise<void>
  skipNext: () => Promise<void>
  skipPrevious: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  setVolume: (vol: number) => Promise<void>
  addToQueue: (spotifyUri: string) => Promise<void>
  playWithQueue: (uris: string[]) => Promise<void>
  setQueueMetadata: (tracks: QueueTrack[]) => void
  dismissError: () => void
  /** Desktop (Connect) mode: available Spotify Connect devices */
  availableDevices: Array<{ id: string; name: string; type: string; isActive: boolean }>
  /** Transfer playback to a specific device */
  selectDevice: (deviceId: string) => Promise<void>
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextValue | null>(null)

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'

function trackToQueueTrack(t: SpotifyTrack): QueueTrack {
  return {
    uri: t.uri,
    id: t.id,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    albumArt: t.album.images[0]?.url ?? null,
  }
}

const STORAGE_KEY = 'otix_spotify_playback'
const DEVICE_WAIT_TIMEOUT_MS = 5000
const DEVICE_WAIT_INTERVAL_MS = 100

interface SavedPlaybackState {
  uri: string
  position: number
  wasPlaying: boolean
  timestamp: number
}

function savePlaybackState(uri: string, position: number, wasPlaying: boolean) {
  try {
    const state: SavedPlaybackState = { uri, position, wasPlaying, timestamp: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage not available
  }
}

function loadPlaybackState(): SavedPlaybackState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as SavedPlaybackState
    // Expire after 2 hours
    if (Date.now() - state.timestamp > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return state
  } catch {
    return null
  }
}

function clearPlaybackState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

async function fetchAccessToken(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ accessToken: string }>('/integrations/spotify/token')
    return data.accessToken
  } catch (e) {
    console.error('Failed to fetch Spotify access token:', e)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForValue<T>(
  getValue: () => T | null,
  timeoutMs = DEVICE_WAIT_TIMEOUT_MS,
): Promise<T | null> {
  const existing = getValue()
  if (existing) return existing

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(DEVICE_WAIT_INTERVAL_MS)
    const value = getValue()
    if (value) return value
  }
  return null
}

export function SpotifyPlayerProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const { toast } = useToast()
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<CurrentTrackInfo | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(0.5)
  const [nextTracks, setNextTracks] = useState<QueueTrack[]>([])
  const [previousTracks, setPreviousTracks] = useState<QueueTrack[]>([])
  const [error, setError] = useState<string | null>(null)
  const [availableDevices, setAvailableDevices] = useState<Array<{ id: string; name: string; type: string; isActive: boolean }>>([])
  const playerRef = useRef<SpotifyPlayerInstance | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const sdkLoadedRef = useRef(false)
  const positionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeAttemptedRef = useRef(false)
  const lastToastRef = useRef<{ message: string; timestamp: number } | null>(null)
  const pendingPlaybackRef = useRef<{ uri: string; expiresAt: number } | null>(null)
  const queuedTracksRef = useRef<QueueTrack[]>([])
  const tickCounterRef = useRef(0)
  /** Number of consecutive auth failures — used as circuit breaker to stop SDK retry storms */
  const authFailureCountRef = useRef(0)
  const AUTH_FAILURE_LIMIT = 5

  // Are we running in Electron? If so skip Web Playback SDK (no DRM/CDM
  // guarantees) and use the Connect REST API as a remote control instead.
  const [isDesktop] = useState(() => typeof window !== 'undefined' && !!(window as any).desktopAPI)
  const [connectMode] = useState(isDesktop)
  // Mirror availableDevices in a ref so Connect play callbacks can read the
  // latest active device without needing state in their dependency arrays.
  const availableDevicesRef = useRef<Array<{ id: string; name: string; type: string; isActive: boolean }>>([])

  const hasSpotify = isAuthenticated && !!user?.spotifyId

  const notifyError = useCallback((message: string, description?: string) => {
    const now = Date.now()
    const lastToast = lastToastRef.current
    if (lastToast?.message === message && now - lastToast.timestamp < 3000) return
    lastToastRef.current = { message, timestamp: now }
    setError(message)
    toast({
      title: message,
      description,
      variant: 'error',
    })
  }, [toast])

  const markPendingPlayback = useCallback((uri: string) => {
    pendingPlaybackRef.current = { uri, expiresAt: Date.now() + 4000 }
    window.setTimeout(() => {
      if (pendingPlaybackRef.current?.uri === uri) {
        pendingPlaybackRef.current = null
      }
    }, 4000)
  }, [])

  const getPendingPlaybackUri = useCallback(() => {
    const pending = pendingPlaybackRef.current
    if (!pending || pending.expiresAt < Date.now()) {
      pendingPlaybackRef.current = null
      return null
    }
    return pending.uri
  }, [])

  const playbackStarted = useCallback(async (expectedUri?: string | null) => {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      await sleep(200)
      const state = await playerRef.current?.getCurrentState()
      if (!state || state.paused) continue
      const currentUri = state.track_window.current_track?.uri
      if (!expectedUri) return Boolean(currentUri)
      if (currentUri === expectedUri) return true
    }
    const state = await playerRef.current?.getCurrentState()
    return !!(state && !state.paused)
  }, [])

  // Save playback state to localStorage for resume-on-reload
  useEffect(() => {
    if (currentTrack?.uri && duration > 0) {
      savePlaybackState(currentTrack.uri, position, isPlaying)
    }
  }, [currentTrack?.uri, position, isPlaying, duration])

  // Update position while playing, re-syncing with SDK every 10s to correct drift
  useEffect(() => {
    if (isPlaying && duration > 0) {
      tickCounterRef.current = 0
      positionTimerRef.current = setInterval(() => {
        tickCounterRef.current++
        setPosition((prev) => Math.min(prev + 1000, duration))
        if (tickCounterRef.current % 10 === 0) {
          playerRef.current?.getCurrentState().then((state) => {
            if (state) setPosition(state.position)
          })
        }
      }, 1000)
    } else {
      if (positionTimerRef.current) {
        clearInterval(positionTimerRef.current)
        positionTimerRef.current = null
      }
    }
    return () => {
      if (positionTimerRef.current) {
        clearInterval(positionTimerRef.current)
      }
    }
  }, [isPlaying, duration])

  // Keep ref in sync with state so Electron play callbacks always see the
  // latest device list without adding availableDevices to their dep arrays.
  useEffect(() => {
    availableDevicesRef.current = availableDevices
  }, [availableDevices])

  const callSpotifyApi = useCallback(async (method: string, path: string, body?: unknown) => {
    let token = tokenRef.current
    if (!token) {
      token = await fetchAccessToken()
      if (token) tokenRef.current = token
    }
    if (!token) throw new Error('No Spotify token')

    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (res.ok) {
      if (res.status === 204) return null
      return res.json()
    }

    if (res.status === 401) {
      // Token expired — fetch a fresh one from the backend and retry once
      tokenRef.current = null
      const newToken = await fetchAccessToken()
      if (!newToken) throw new Error('Failed to refresh token')
      tokenRef.current = newToken
      token = newToken

      const retryRes = await fetch(`https://api.spotify.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      if (retryRes.ok) {
        if (retryRes.status === 204) return null
        return retryRes.json()
      }
    }

    throw new Error(`Spotify API error: ${res.status}`)
  }, [])

  // ── Desktop (Electron) mode: Spotify Connect REST API ──────
  // Instead of the Web Playback SDK (which requires EME/PlayReady
  // unavailable in Electron on Windows), poll the REST API for the
  // currently-playing track and control external Spotify Connect devices.

  useEffect(() => {
    // Connect fallback is only active when the SDK has failed in Electron.
    if (!hasSpotify || !connectMode) return

    let disposed = false
    setIsReady(true) // Connect mode is always "ready" to receive commands

    async function pollPlayback() {
      if (disposed) return
      try {
        const data = await callSpotifyApi('GET', '/me/player/currently-playing')
        if (disposed) return
        if (!data || !data.item) {
          setIsPlaying(false)
          setCurrentTrack(null)
          setPosition(0)
          setDuration(0)
          return
        }
        setIsPlaying(data.is_playing ?? false)
        setPosition(data.progress_ms ?? 0)
        setDuration(data.item.duration_ms ?? 0)
        const item = data.item
        setCurrentTrack({
          id: item.id,
          uri: item.uri,
          name: item.name,
          artist: (item.artists ?? []).map((a: any) => a.name).join(', '),
          artists: (item.artists ?? []).map((a: any) => ({ name: a.name, uri: a.uri })),
          albumName: item.album?.name ?? '',
          albumArt: item.album?.images?.[0]?.url ?? null,
          durationMs: item.duration_ms ?? 0,
        })
      } catch {
        // Transient network/API error — preserve existing state to avoid flashing
        // empty on intermittent failures; the next poll will correct it.
      }
    }

    async function pollDevices() {
      if (disposed) return
      try {
        const data = await callSpotifyApi('GET', '/me/player/devices')
        if (disposed || !data?.devices) return
        setAvailableDevices(
          (data.devices as Array<{ id: string; name: string; type: string; is_active: boolean }>).map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            isActive: d.is_active,
          })),
        )
      } catch { /* best effort */ }
    }

    pollPlayback()
    pollDevices()
    const playbackTimer = setInterval(pollPlayback, 3000)
    const deviceTimer = setInterval(pollDevices, 15000)

    return () => {
      disposed = true
      clearInterval(playbackTimer)
      clearInterval(deviceTimer)
    }
  }, [hasSpotify, connectMode, callSpotifyApi])

  // Load SDK script (browser only — Electron uses Connect REST API)
  // Load SDK script (browser only — Electron uses Connect REST API)
  useEffect(() => {
    if (!hasSpotify || sdkLoadedRef.current || isDesktop) return

    const existing = document.querySelector(`script[src="${SDK_URL}"]`)
    if (existing) {
      sdkLoadedRef.current = true
      return
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      sdkLoadedRef.current = true
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onerror = () => {
      console.error('Failed to load Spotify Web Playback SDK from', SDK_URL)
    }
    document.body.appendChild(script)
  }, [hasSpotify])

  // Create and connect player (browser only — Electron uses Connect REST API)
  useEffect(() => {
  // Create and connect player (browser only — Electron uses Connect REST API)
    if (!hasSpotify || isDesktop) return

    let player: SpotifyPlayerInstance | null = null
    let disposed = false

    // Wait for the first ready or initialization_error event from the SDK.
    // Returns true on ready, false on error/connect-failure.
    function waitForInit(p: SpotifyPlayerInstance): Promise<boolean> {
      return new Promise((resolve) => {
        let settled = false
        const onReady = () => { if (settled) return; settled = true; cleanup(); resolve(true) }
        const onError = () => { if (settled) return; settled = true; cleanup(); resolve(false) }
        const cleanup = () => {
          p.removeListener('ready', onReady)
          p.removeListener('initialization_error', onError)
        }
        p.addListener('ready', onReady)
        p.addListener('initialization_error', onError)
        // Safety timeout — if neither event fires within 15 s, treat as failure
        setTimeout(() => { if (!settled) { settled = true; cleanup(); resolve(false) } }, 15000)
      })
    }

    async function initOne(): Promise<boolean> {
      if (disposed) return false

      // Retry token fetch up to 3 times for transient failures
      let token: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        token = await fetchAccessToken()
        if (token) break
        if (attempt < 2) await sleep(1000 * (attempt + 1))
      }

      if (disposed) return false

      if (!token) {
        console.error('Spotify player cannot initialize: failed to fetch access token')
        notifyError(
          'Could not start Spotify player',
          'Check your Spotify connection in Settings and try reconnecting.',
        )
        return false
      }
      tokenRef.current = token

      player = new window.Spotify.Player({
        name: 'Otix',
        getOAuthToken: (cb: (token: string) => void) => {
          // Always fetch fresh token — SDK calls this on 401 to retry.
          // Returning stale tokenRef.current causes infinite 401 retry storm.
          let attempts = 0
          const tryFetch = async () => {
            const t = await fetchAccessToken()
            if (t) {
              tokenRef.current = t
              cb(t)
              return
            }
            attempts++
            if (attempts < 3) {
              setTimeout(tryFetch, 1000 * attempts)
            } else {
              console.error('Spotify SDK requested token but fetch failed after 3 attempts')
              cb('')
              notifyError(
                'Spotify session expired',
                'Reconnect your Spotify account in Settings.',
              )
            }
          }
          tryFetch()
        },
        volume: 0.5,
      }) as unknown as SpotifyPlayerInstance

      playerRef.current = player

      // ── Persistent event listeners ────────────────────────────

      player.addListener('ready', async ({ device_id }: { device_id: string }) => {
        authFailureCountRef.current = 0  // reset circuit breaker on successful init
        deviceIdRef.current = device_id
        setIsReady(true)
        setError(null)

        // Resume playback from last session, or transfer from another device
        if (!resumeAttemptedRef.current && !disposed) {
          resumeAttemptedRef.current = true
          const saved = loadPlaybackState()

          if (saved && saved.uri && saved.wasPlaying) {
            try {
              const token = tokenRef.current || (await fetchAccessToken())
              if (!token) return
              await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uris: [saved.uri], position_ms: saved.position }),
              })
            } catch {
              clearPlaybackState()
            }
          } else {
            try {
              const token = tokenRef.current || (await fetchAccessToken())
              if (!token) return
              const res = await fetch('https://api.spotify.com/v1/me/player', {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (res.status === 200) {
                const playerState = await res.json()
                if (playerState.device && playerState.device.id !== device_id && playerState.item) {
                  await fetch('https://api.spotify.com/v1/me/player', {
                    method: 'PUT',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ device_ids: [device_id] }),
                  })
                }
              }
            } catch { /* optional */ }
          }
        }
      })

      player.addListener('not_ready', () => {
        deviceIdRef.current = null
        setIsReady(false)
      })

      player.addListener('player_state_changed', (state: PlaybackState | null) => {
        if (!state) {
          setIsPlaying(false)
          setCurrentTrack(null)
          setPosition(0)
          setDuration(0)
          setNextTracks([])
          return
        }

        setIsPlaying(!state.paused)
        setPosition(state.position)
        setDuration(state.duration)

        const track = state.track_window.current_track
        setCurrentTrack({
          id: track.id,
          uri: track.uri,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(', '),
          artists: track.artists.map((a) => ({ name: a.name, uri: a.uri })),
          albumName: track.album.name,
          albumArt: track.album.images[0]?.url ?? null,
          durationMs: track.duration_ms,
        })

        const storedQueue = queuedTracksRef.current
        const currentIdx = storedQueue.findIndex((q) => q.uri === track.uri)
        if (currentIdx >= 0) {
          setPreviousTracks((prev) => {
            const newPrev = storedQueue.slice(0, currentIdx)
            const existingUris = new Set(prev.map((p) => p.uri))
            const toAdd = newPrev.filter((t) => !existingUris.has(t.uri))
            return [...prev, ...toAdd]
          })
          const upcoming = storedQueue.slice(currentIdx + 1)
          setNextTracks(upcoming.length > 0 ? upcoming : state.track_window.next_tracks.map(trackToQueueTrack))
        } else {
          setNextTracks(state.track_window.next_tracks.map(trackToQueueTrack))
        }
      })

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        authFailureCountRef.current++
        console.error('Spotify player auth error:', message, `(x${authFailureCountRef.current})`)

        if (authFailureCountRef.current >= AUTH_FAILURE_LIMIT) {
          // Circuit breaker: disconnect player to stop SDK internal retry storm.
          // The SDK loops indefinitely on check_scope / state 401s unless we
          // tear down the player instance.
          console.warn('Spotify auth failure limit reached — disconnecting player')
          notifyError(
            'Spotify connection lost',
            'Reconnect your Spotify account in Settings.',
          )
          try { player?.disconnect() } catch { /* ignore */ }
          return
        }

        notifyError('Spotify authentication failed', 'Try reconnecting your Spotify account.')
      })

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Spotify player account error:', message)
        notifyError('Spotify Premium is required for playback')
      })

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Spotify playback error:', message)
        window.setTimeout(async () => {
          if (await playbackStarted(getPendingPlaybackUri())) return
          notifyError('Playback error', 'Try again in a moment.')
        }, 700)
      })

      // Connect and wait for the SDK to confirm (ready) or deny (initialization_error)
      try {
        const connectPromise = player.connect()
        const ok = await waitForInit(player)
        await connectPromise  // let the connect promise settle so errors are consumed
        if (ok) return true
      } catch (err) {
        console.error('Spotify player connect threw:', err)
      }

      // Init failed — clean up so the retry loop can retry
      if (!disposed) {
        player.disconnect()
        player = null
        playerRef.current = null
        tokenRef.current = null
      }
      return false
    }

    async function initWithRetry() {
      if (disposed) return false
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          setError(`Reconnecting to Spotify (attempt ${attempt}/3)…`)
          await sleep(500 * (attempt - 1))
        }
        console.log(`Spotify init attempt ${attempt}/3`)
        const ok = await initOne()
        if (ok) return true
        if (disposed) return false
      }
      notifyError(
        'Failed to initialize Spotify player',
        'Check your Spotify connection in Settings and try reconnecting.',
      )
      return false
    }

    const tryInit = () => {
      if (window.Spotify) {
        initWithRetry()
      } else {
        window.onSpotifyWebPlaybackSDKReady = () => {
          if (!disposed) initWithRetry()
        }
      }
    }

    const timeout = setTimeout(tryInit, 100)

    let reconnecting = false

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !disposed) {
        if (playerRef.current) {
          playerRef.current.connect().catch((err) => {
            console.error('Spotify player reconnect threw:', err)
          })
        } else if (!reconnecting && window.Spotify) {
          reconnecting = true
          initOne().finally(() => { reconnecting = false })
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (player) {
        player.disconnect()
        playerRef.current = null
      }
      setIsReady(false)
      setIsPlaying(false)
      setCurrentTrack(null)
      setPosition(0)
      setDuration(0)
    }
  }, [getPendingPlaybackUri, hasSpotify, notifyError, playbackStarted])

  const startPlayback = useCallback(
    async (deviceId: string, body: unknown) => {
      const path = `/me/player/play?device_id=${deviceId}`
      try {
        return await callSpotifyApi('PUT', path, body)
      } catch (e) {
        // If the device_id is stale (404), retry without it so Spotify
        // uses the currently active device instead.
        if (e instanceof Error && e.message.includes('404')) {
          return callSpotifyApi('PUT', '/me/player/play', body)
        }
        await sleep(600)
        return callSpotifyApi('PUT', path, body)
      }
    },
    [callSpotifyApi],
  )

  const verifyAndResume = useCallback(async (expectedUri: string) => {
    // The Spotify play API can return 204 while the SDK loads the track
    // but stays paused. Poll quickly (every 250ms) and use togglePlay
    // to kickstart audio — the same call the user's manual second click
    // makes. Exits early as soon as the track is confirmed playing.
    for (let i = 0; i < 6; i++) {
      await sleep(250)
      const state = await playerRef.current?.getCurrentState()
      if (!state) continue
      const currentUri = state.track_window.current_track?.uri
      if (currentUri === expectedUri) {
        if (!state.paused) return
        try { await playerRef.current?.togglePlay() } catch { /* best effort */ }
        return
      }
    }
  }, [])

  const play = useCallback(
    async (spotifyUri: string) => {
      if (connectMode) {
        setError(null)
        markPendingPlayback(spotifyUri)
        try {
          // Route to the currently active Spotify Connect device so playback
          // doesn't accidentally land on a browser SDK device when both are open.
          const activeDevice = availableDevicesRef.current.find((d) => d.isActive)
          const path = activeDevice
            ? `/me/player/play?device_id=${activeDevice.id}`
            : '/me/player/play'
          await callSpotifyApi('PUT', path, { uris: [spotifyUri] })
        } catch (e) {
          console.error('Play error:', e)
          notifyError('Could not start playback', 'Make sure Spotify is open on a device.')
        }
        return
      }

      const deviceId = await waitForValue(() => deviceIdRef.current)
      if (!deviceId) {
        notifyError('Spotify player is still connecting', 'Try again in a moment.')
        return
      }

      setError(null)
      setPreviousTracks([])
      markPendingPlayback(spotifyUri)
      try {
        await startPlayback(deviceId, {
          uris: [spotifyUri],
        })
        // Fire-and-forget: verify playback started, resume if paused
        void verifyAndResume(spotifyUri)
      } catch (e) {
        console.error('Play error:', e)
        if (await playbackStarted(spotifyUri)) return
        notifyError('Could not start playback')
      }
    },
    [markPendingPlayback, notifyError, playbackStarted, startPlayback, verifyAndResume, callSpotifyApi],
  )

  const togglePlay = useCallback(async () => {
    if (connectMode) {
      try {
        if (isPlaying) {
          await callSpotifyApi('PUT', '/me/player/pause')
          setIsPlaying(false) // optimistic update — avoids double-toggle on stale 3-second poll state
        } else {
          await callSpotifyApi('PUT', '/me/player/play')
          setIsPlaying(true)
        }
      } catch {
        notifyError('Could not toggle playback', 'Make sure Spotify is playing on a device.')
      }
      return
    }

    const player = await waitForValue(() => playerRef.current)
    if (!player) {
      notifyError('Spotify player is still connecting', 'Try again in a moment.')
      return
    }
    try {
      await player.togglePlay()
    } catch {
      notifyError('Could not toggle playback')
    }
  }, [connectMode, isPlaying, notifyError, callSpotifyApi])

  const skipNext = useCallback(async () => {
    if (connectMode) {
      try { await callSpotifyApi('POST', '/me/player/next') }
      catch { notifyError('Could not skip track') }
      return
    }
    const player = await waitForValue(() => playerRef.current)
    if (!player) return
    try {
      await player.nextTrack()
    } catch {
      notifyError('Could not skip track')
    }
  }, [connectMode, notifyError, callSpotifyApi])

  const skipPrevious = useCallback(async () => {
    if (connectMode) {
      try { await callSpotifyApi('POST', '/me/player/previous') }
      catch { notifyError('Could not go back') }
      return
    }
    const player = await waitForValue(() => playerRef.current)
    if (!player) return
    try {
      await player.previousTrack()
    } catch {
      notifyError('Could not go back')
    }
  }, [connectMode, notifyError, callSpotifyApi])

  const seek = useCallback(
    async (positionMs: number) => {
      if (connectMode) {
        try {
          await callSpotifyApi('PUT', `/me/player/seek?position_ms=${positionMs}`)
          setPosition(positionMs)
        } catch {
          notifyError('Could not seek')
        }
        return
      }
      const deviceId = await waitForValue(() => deviceIdRef.current)
      if (!deviceId) return

      try {
        await callSpotifyApi('PUT', `/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`)
        setPosition(positionMs)
      } catch {
        notifyError('Could not seek')
      }
    },
    [connectMode, callSpotifyApi, notifyError],
  )

  const setPlayerVolume = useCallback(async (vol: number) => {
    const clamped = Math.min(1, Math.max(0, vol))
    setVolumeState(clamped)
    // Connect mode: Spotify REST API doesn't control local volume — keep UI state only.
    if (!connectMode && playerRef.current) {
      try {
        await playerRef.current.setVolume(clamped)
      } catch { /* best effort */ }
    }
  }, [connectMode])

  const addToQueue = useCallback(
    async (spotifyUri: string) => {
      try {
        await callSpotifyApi('POST', `/me/player/queue?uri=${encodeURIComponent(spotifyUri)}`)
      } catch {
        notifyError('Could not add to queue')
      }
    },
    [callSpotifyApi, notifyError],
  )

  const setQueueMetadata = useCallback((tracks: QueueTrack[]) => {
    queuedTracksRef.current = tracks
  }, [])

  const playWithQueue = useCallback(
    async (uris: string[]) => {
      // Connect fallback mode — use the REST API directly; no SDK device required
      if (connectMode) {
        if (uris.length === 0) return
        setError(null)
        markPendingPlayback(uris[0])
        try {
          const activeDevice = availableDevicesRef.current.find((d) => d.isActive)
          const path = activeDevice
            ? `/me/player/play?device_id=${activeDevice.id}`
            : '/me/player/play'
          await callSpotifyApi('PUT', path, { uris: uris.slice(0, 100) })
        } catch (e) {
          console.error('Play error:', e)
          notifyError('Could not start playback', 'Make sure Spotify is open on a device.')
        }
        return
      }

      const deviceId = await waitForValue(() => deviceIdRef.current)
      if (!deviceId) {
        notifyError('Spotify player is still connecting', 'Try again in a moment.')
        return
      }

      if (uris.length === 0) return

      setError(null)
      setPreviousTracks([])
      markPendingPlayback(uris[0])
      try {
        // Send up to 100 URIs in the play request so Spotify creates an
        // ephemeral context — skip/next work natively without manual queueing.
        const batch = uris.slice(0, 100)
        await startPlayback(deviceId, { uris: batch })

        // Queue any remaining tracks beyond the 100-URI limit.
        for (let i = 100; i < uris.length; i++) {
          try {
            await callSpotifyApi('POST', `/me/player/queue?uri=${encodeURIComponent(uris[i])}`)
          } catch {
            // Queueing failed for this track, but playback already started —
            // continue queueing remaining tracks rather than failing entirely.
          }
        }
        // Fire-and-forget: verify playback started, resume if paused
        void verifyAndResume(uris[0])
      } catch (e) {
        console.error('Play error:', e)
        if (await playbackStarted(uris[0])) return
        notifyError('Could not start playback')
      }
    },
    [callSpotifyApi, markPendingPlayback, notifyError, playbackStarted, startPlayback, verifyAndResume],
  )

  const dismissError = useCallback(() => setError(null), [])

  const selectDevice = useCallback(async (deviceId: string) => {
    try {
      await callSpotifyApi('PUT', '/me/player', { device_ids: [deviceId] })
    } catch {
      notifyError('Could not switch device')
    }
  }, [callSpotifyApi, notifyError])

  const value: SpotifyPlayerContextValue = {
    isReady,
    isPlaying,
    currentTrack,
    error,
    position,
    duration,
    volume,
    nextTracks,
    previousTracks,
    play,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume: setPlayerVolume,
    addToQueue,
    playWithQueue,
    setQueueMetadata,
    dismissError,
    availableDevices,
    selectDevice,
  }

  return (
    <SpotifyPlayerContext.Provider value={value}>
      {children}
    </SpotifyPlayerContext.Provider>
  )
}

const defaultContextValue: SpotifyPlayerContextValue = {
  isReady: false,
  isPlaying: false,
  currentTrack: null,
  error: null,
  position: 0,
  duration: 0,
  volume: 0.5,
  nextTracks: [],
  previousTracks: [],
  play: async () => {},
  togglePlay: async () => {},
  skipNext: async () => {},
  skipPrevious: async () => {},
  seek: async () => {},
  setVolume: async () => {},
  addToQueue: async () => {},
  playWithQueue: async () => {},
  setQueueMetadata: () => {},
  dismissError: () => {},
  availableDevices: [],
  selectDevice: async () => {},
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpotifyPlayer() {
  const ctx = useContext(SpotifyPlayerContext)
  return ctx ?? defaultContextValue
}
