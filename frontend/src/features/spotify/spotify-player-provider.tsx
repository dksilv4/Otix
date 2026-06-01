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
    const { data } = await apiClient.get<{ accessToken: string }>('/auth/integrations/spotify/token')
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

  // Load SDK script
  useEffect(() => {
    if (!hasSpotify || sdkLoadedRef.current) return

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

  // Create and connect player
  useEffect(() => {
    if (!hasSpotify) return

    let player: SpotifyPlayerInstance | null = null
    let disposed = false

    async function initPlayer() {
      if (disposed) return

      // Retry token fetch up to 3 times for transient failures
      let token: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        token = await fetchAccessToken()
        if (token) break
        if (attempt < 2) await sleep(1000 * (attempt + 1))
      }

      if (disposed) return

      if (!token) {
        console.error('Spotify player cannot initialize: failed to fetch access token')
        notifyError(
          'Could not start Spotify player',
          'Check your Spotify connection in Settings and try reconnecting.',
        )
        return
      }
      tokenRef.current = token

      player = new window.Spotify.Player({
        name: 'Otix',
        getOAuthToken: (cb: (token: string) => void) => {
          // If we already have a token, use it immediately so the SDK
          // doesn't block on connect() waiting for a network round-trip.
          if (tokenRef.current) {
            cb(tokenRef.current)
            return
          }

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
              // Must call cb even on failure — otherwise connect() hangs
              // forever and the player never reaches a terminal state.
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

      player.addListener('ready', async ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id
        setIsReady(true)
        setError(null)

        // Resume playback from last session, or transfer from another device
        if (!resumeAttemptedRef.current && !disposed) {
          resumeAttemptedRef.current = true
          const saved = loadPlaybackState()

          if (saved && saved.uri && saved.wasPlaying) {
            // Case 1: Was playing in Otix before reload — resume exactly where we left off
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
            // Case 2: No local resume state — check if the user is playing on another
            // Spotify device (phone, desktop app, etc.) and transfer playback here.
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
            } catch {
              // Optional — don't notify the user for this best-effort transfer
            }
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

        // Use our client-side queue when available (shows all upcoming tracks),
        // otherwise fall back to the SDK's limited next_tracks.
        const storedQueue = queuedTracksRef.current
        const currentIdx = storedQueue.findIndex((q) => q.uri === track.uri)
        if (currentIdx >= 0) {
          // Push tracks before current to previous, and slice upcoming
          setPreviousTracks((prev) => {
            const newPrev = storedQueue.slice(0, currentIdx)
            // Deduplicate: only add tracks not already in the previous list
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

      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Spotify player initialization error:', message)
        notifyError('Failed to initialize Spotify player')
      })

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Spotify player auth error:', message)
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

      try {
        const connected = await player.connect()
        if (!connected && !disposed) {
          notifyError('Could not connect Spotify player')
        }
      } catch (err) {
        console.error('Spotify player connect threw:', err)
        if (!disposed) {
          notifyError('Could not connect Spotify player')
        }
      }
    }

    const tryInit = () => {
      if (window.Spotify) {
        initPlayer()
      } else {
        window.onSpotifyWebPlaybackSDKReady = () => {
          if (!disposed) initPlayer()
        }
      }
    }

    const timeout = setTimeout(tryInit, 500)

    let reconnecting = false

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !disposed) {
        if (playerRef.current) {
          playerRef.current.connect().catch((err) => {
            console.error('Spotify player reconnect threw:', err)
          })
        } else if (!reconnecting && window.Spotify) {
          reconnecting = true
          initPlayer().finally(() => {
            reconnecting = false
          })
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

  const callSpotifyApi = useCallback(async (method: string, path: string, body?: unknown) => {
    let token = tokenRef.current || (await fetchAccessToken())
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
    [markPendingPlayback, notifyError, playbackStarted, startPlayback, verifyAndResume],
  )

  const togglePlay = useCallback(async () => {
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
  }, [notifyError])

  const skipNext = useCallback(async () => {
    const player = await waitForValue(() => playerRef.current)
    if (!player) return
    try {
      await player.nextTrack()
    } catch {
      notifyError('Could not skip track')
    }
  }, [notifyError])

  const skipPrevious = useCallback(async () => {
    const player = await waitForValue(() => playerRef.current)
    if (!player) return
    try {
      await player.previousTrack()
    } catch {
      notifyError('Could not go back')
    }
  }, [notifyError])

  const seek = useCallback(
    async (positionMs: number) => {
      const deviceId = await waitForValue(() => deviceIdRef.current)
      if (!deviceId) return

      try {
        await callSpotifyApi('PUT', `/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`)
        setPosition(positionMs)
      } catch {
        notifyError('Could not seek')
      }
    },
    [callSpotifyApi, notifyError],
  )

  const setPlayerVolume = useCallback(async (vol: number) => {
    const clamped = Math.min(1, Math.max(0, vol))
    setVolumeState(clamped)

    if (playerRef.current) {
      try {
        await playerRef.current.setVolume(clamped)
      } catch {
        // volume change failed, keep UI state
      }
    }
  }, [])

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
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSpotifyPlayer() {
  const ctx = useContext(SpotifyPlayerContext)
  return ctx ?? defaultContextValue
}
