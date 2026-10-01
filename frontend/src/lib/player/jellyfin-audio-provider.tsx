import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface JellyfinTrackInfo {
  id: string
  itemId: string
  title: string
  artist: string
  albumName: string
  albumArt: string | null
  durationMs: number
  serverUrl: string | null
  token: string | null
}

interface JellyfinPlayerContextValue {
  isPlaying: boolean
  currentTrack: JellyfinTrackInfo | null
  position: number
  duration: number
  volume: number
  queue: JellyfinTrackInfo[]
  previousTracks: JellyfinTrackInfo[]
  error: string | null
  playTrack: (track: JellyfinTrackInfo) => Promise<void>
  playAlbum: (tracks: JellyfinTrackInfo[], startIndex?: number) => Promise<void>
  togglePlay: () => void
  pause: () => void
  resume: () => void
  seek: (ms: number) => void
  setVolume: (vol: number) => void
  skipNext: () => void
  skipPrevious: () => void
  skipToIndex: (index: number) => void
  stop: () => void
}

const JellyfinPlayerContext = createContext<JellyfinPlayerContextValue | null>(null)

const VOLUME_KEY = 'jellyfin-player-volume'
const CLIENT_ID_KEY = 'jellyfin-audio-client-id'

function getClientId(): string {
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_ID_KEY) : null
  if (!id) {
    id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'otix-jf-aud-' + Date.now().toString(36)
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export function JellyfinAudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<JellyfinTrackInfo | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    if (typeof localStorage === 'undefined') return 0.7
    const saved = localStorage.getItem(VOLUME_KEY)
    return saved ? parseFloat(saved) : 0.7
  })
  const [queue, setQueue] = useState<JellyfinTrackInfo[]>([])
  const [previousTracks, setPreviousTracks] = useState<JellyfinTrackInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const queueRef = useRef<JellyfinTrackInfo[]>([])
  const currentIndexRef = useRef(-1)

  const clientIdRef = useRef(getClientId())
  const playSessionIdRef = useRef('')

  // Report progress heartbeat to Jellyfin
  const reportTimeline = useCallback((state: 'playing' | 'paused' | 'stopped', posMs?: number) => {
    const track = currentTrack
    if (!track?.serverUrl || !track?.token || !playSessionIdRef.current) return

    const endpoint = state === 'stopped' ? '/Sessions/Playing/Stopped' : state === 'playing' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Progress'
    const curPos = posMs != null ? posMs : position
    const authHeader = `MediaBrowser Client="Otix", Device="Desktop", DeviceId="${clientIdRef.current}", Version="1.0.0", Token="${track.token}"`

    fetch(`${track.serverUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'X-Emby-Token': track.token,
      },
      body: JSON.stringify({
        ItemId: track.itemId,
        PlaySessionId: playSessionIdRef.current,
        PositionTicks: Math.round(curPos * 10000),
        IsPaused: state === 'paused',
      }),
    }).catch(() => {})
  }, [currentTrack, position])

  // Periodic heartbeat while playing
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      reportTimeline('playing')
    }, 10000)
    return () => clearInterval(timer)
  }, [isPlaying, reportTimeline])

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio()
    audio.volume = volume
    audioRef.current = audio

    const onTimeUpdate = () => setPosition(Math.round(audio.currentTime * 1000))
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(Math.round(audio.duration * 1000))
      }
    }
    const onEnded = () => {
      reportTimeline('stopped')
      // Skip next
      const q = queueRef.current
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < q.length) {
        skipToIndex(nextIdx)
      } else {
        setIsPlaying(false)
      }
    }
    const onError = () => {
      setError('Audio playback error')
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playIndex = useCallback(async (index: number) => {
    const q = queueRef.current
    if (index < 0 || index >= q.length) return
    const track = q[index]
    if (!track.serverUrl || !track.token) {
      setError('Jellyfin connection details missing')
      return
    }

    currentIndexRef.current = index
    setCurrentTrack(track)
    setPreviousTracks(q.slice(0, index))
    setPosition(0)
    setDuration(track.durationMs || 0)
    setError(null)

    playSessionIdRef.current = 'otix-jf-aud-' + Date.now()

    const streamUrl = `${track.serverUrl}/Audio/${track.itemId}/stream?static=true&api_key=${encodeURIComponent(track.token)}`
    const audio = audioRef.current
    if (audio) {
      audio.src = streamUrl
      audio.currentTime = 0
      try {
        await audio.play()
        setIsPlaying(true)
        reportTimeline('playing', 0)
      } catch {
        setError('Playback failed')
        setIsPlaying(false)
      }
    }
  }, [reportTimeline])

  const playTrack = useCallback(async (track: JellyfinTrackInfo) => {
    queueRef.current = [track]
    setQueue([track])
    await playIndex(0)
  }, [playIndex])

  const playAlbum = useCallback(async (tracks: JellyfinTrackInfo[], startIndex = 0) => {
    if (tracks.length === 0) return
    queueRef.current = tracks
    setQueue(tracks)
    await playIndex(startIndex)
  }, [playIndex])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      reportTimeline('paused')
    } else {
      audio.play().catch(() => {})
      setIsPlaying(true)
      reportTimeline('playing')
    }
  }, [isPlaying, reportTimeline])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    setIsPlaying(false)
    reportTimeline('paused')
  }, [reportTimeline])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().catch(() => {})
    setIsPlaying(true)
    reportTimeline('playing')
  }, [reportTimeline])

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current
    if (!audio) return
    const secs = ms / 1000
    audio.currentTime = secs
    setPosition(ms)
    reportTimeline('playing', ms)
  }, [reportTimeline])

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol))
    setVolumeState(clamped)
    if (typeof localStorage !== 'undefined') localStorage.setItem(VOLUME_KEY, String(clamped))
    if (audioRef.current) audioRef.current.volume = clamped
  }, [])

  const skipToIndex = useCallback((index: number) => {
    playIndex(index)
  }, [playIndex])

  const skipNext = useCallback(() => {
    const nextIdx = currentIndexRef.current + 1
    if (nextIdx < queueRef.current.length) {
      playIndex(nextIdx)
    }
  }, [playIndex])

  const skipPrevious = useCallback(() => {
    const prevIdx = currentIndexRef.current - 1
    if (prevIdx >= 0) {
      playIndex(prevIdx)
    }
  }, [playIndex])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    reportTimeline('stopped')
    setIsPlaying(false)
    setCurrentTrack(null)
  }, [reportTimeline])

  const value: JellyfinPlayerContextValue = {
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    queue,
    previousTracks,
    error,
    playTrack,
    playAlbum,
    togglePlay,
    pause,
    resume,
    seek,
    setVolume,
    skipNext,
    skipPrevious,
    skipToIndex,
    stop,
  }

  return (
    <JellyfinPlayerContext.Provider value={value}>
      {children}
    </JellyfinPlayerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useJellyfinPlayer(): JellyfinPlayerContextValue {
  const ctx = useContext(JellyfinPlayerContext)
  if (!ctx) throw new Error('useJellyfinPlayer must be used within JellyfinAudioProvider')
  return ctx
}
