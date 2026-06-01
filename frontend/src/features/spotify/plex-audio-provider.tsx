import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"

export interface PlexTrackInfo {
  id: string
  ratingKey: string
  title: string
  artist: string
  albumName: string
  albumArt: string | null
  durationMs: number
  plexBaseUrl: string | null
  plexToken: string | null
}

interface PlexPlayerContextValue {
  isPlaying: boolean
  currentTrack: PlexTrackInfo | null
  position: number
  duration: number
  volume: number
  queue: PlexTrackInfo[]
  previousTracks: PlexTrackInfo[]
  error: string | null
  playTrack: (track: PlexTrackInfo) => Promise<void>
  playAlbum: (tracks: PlexTrackInfo[], startIndex?: number) => Promise<void>
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

const PlexPlayerContext = createContext<PlexPlayerContextValue | null>(null)

const VOLUME_KEY = "plex-player-volume"
const CLIENT_ID_KEY = "plex-client-id"

function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

function generateSessionId(): string {
  return crypto.randomUUID()
}

export function PlexAudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<PlexTrackInfo | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem(VOLUME_KEY)
    return saved ? parseFloat(saved) : 0.7
  })
  const [queue, setQueue] = useState<PlexTrackInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const queueRef = useRef<PlexTrackInfo[]>([])
  const currentIndexRef = useRef(-1)

  // Plex session identifiers for timeline reporting
  const clientIdRef = useRef(getClientId())
  const sessionIdRef = useRef("")
  const commandIdRef = useRef(0)
  const timelineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref holders for state consumed by stable callbacks.
  const durationRef = useRef(duration)
  durationRef.current = duration
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // Resolve a Plex track's Part key (direct file URL) from its metadata.
  const resolvePartUrl = useCallback(async (track: PlexTrackInfo): Promise<string> => {
    const baseUrl = track.plexBaseUrl
    const token = track.plexToken
    if (!baseUrl || !token) {
      throw new Error("Missing Plex connection info. Try re-syncing your Plex library in Settings.")
    }

    const metaUrl = `${baseUrl}/library/metadata/${track.ratingKey}?X-Plex-Token=${encodeURIComponent(token)}`
    const metaResp = await fetch(metaUrl, { headers: { Accept: "application/json" } })
    if (!metaResp.ok) {
      throw new Error(`Plex metadata returned ${metaResp.status}`)
    }

    const data = await metaResp.json()
    const mediaContainer = data?.MediaContainer
    if (!mediaContainer) throw new Error("Unexpected Plex metadata response")

    const item = mediaContainer.Metadata?.[0]
    if (!item) throw new Error("Track not found in Plex library")

    const part = item.Media?.[0]?.Part?.[0]
    if (!part?.key) throw new Error("No streamable part found for track")

    return `${baseUrl}${part.key}?X-Plex-Token=${encodeURIComponent(token)}`
  }, [])

  // Stable refs for callbacks used by the audio event handlers.
  const loadAndPlayIndexRef = useRef<(index: number, startNewSession?: boolean) => Promise<void>>(async () => {})
  const reportTimelineRef = useRef<(state: "playing" | "paused" | "stopped" | "buffering") => void>(() => {})
  const startTimelineReportingRef = useRef<() => void>(() => {})
  const stopTimelineReportingRef = useRef<() => void>(() => {})

  // Report playback state to Plex so it appears on the dashboard.
  // Defined as a stable callback using only refs (no state dependencies).
  const reportTimeline = useCallback((state: "playing" | "paused" | "stopped" | "buffering") => {
    const track = queueRef.current[currentIndexRef.current]
    if (!track?.plexBaseUrl || !track?.plexToken) return

    const audio = audioRef.current
    const currentTime = audio ? Math.round(audio.currentTime * 1000) : 0
    const dur = track.durationMs || durationRef.current
    const cmdId = ++commandIdRef.current

    const params = new URLSearchParams()
    params.set("ratingKey", track.ratingKey)
    params.set("key", `/library/metadata/${track.ratingKey}`)
    params.set("state", state)
    params.set("time", String(currentTime))
    params.set("duration", String(dur))
    params.set("type", "music")
    params.set("commandID", String(cmdId))

    const url = `${track.plexBaseUrl}/:/timeline?${params.toString()}`

    fetch(url, {
      headers: {
        "X-Plex-Token": track.plexToken,
        "X-Plex-Client-Identifier": clientIdRef.current,
        "X-Plex-Product": "Otix",
        "X-Plex-Version": "1.0.0",
        "X-Plex-Platform": "Web",
        "X-Plex-Device": "Browser",
        "X-Plex-Session-Identifier": sessionIdRef.current,
        "X-Plex-Playback-Session-Id": sessionIdRef.current,
      },
    }).catch(() => {})
  }, [])
  reportTimelineRef.current = reportTimeline

  // Start periodic timeline reporting while playing.
  const startTimelineReporting = useCallback(() => {
    stopTimelineReportingRef.current()
    reportTimelineRef.current("buffering")
    setTimeout(() => reportTimelineRef.current("playing"), 500)
    timelineIntervalRef.current = setInterval(() => {
      reportTimelineRef.current("playing")
    }, 5000)
  }, [])
  startTimelineReportingRef.current = startTimelineReporting

  const stopTimelineReporting = useCallback(() => {
    if (timelineIntervalRef.current) {
      clearInterval(timelineIntervalRef.current)
      timelineIntervalRef.current = null
    }
    reportTimelineRef.current("stopped")
  }, [])
  stopTimelineReportingRef.current = stopTimelineReporting

  // Load and play a track by queue index. Streams directly from Plex — no blob download.
  // Set startNewSession=true when the user explicitly starts a new playback context
  // (playTrack/playAlbum), so Plex sees track changes within a queue as one session.
  const loadAndPlayIndex = useCallback(async (index: number, startNewSession = false) => {
    const audio = audioRef.current
    if (!audio) return
    const q = queueRef.current
    if (index < 0 || index >= q.length) return

    const track = q[index]
    currentIndexRef.current = index
    setCurrentTrack(track)
    setError(null)

    try {
      const streamUrl = await resolvePartUrl(track)

      if (startNewSession) {
        sessionIdRef.current = generateSessionId()
        commandIdRef.current = 0
      }

      audio.src = streamUrl
      await audio.play()
    } catch (e: any) {
      const msg = e?.message || String(e)
      // Ignore AbortError from rapid track changes — the next play will supersede.
      if (e instanceof DOMException && e.name === "AbortError") return
      console.error("[PlexAudio] play() failed:", msg)
      setError(msg)
    }
  }, [resolvePartUrl])
  loadAndPlayIndexRef.current = loadAndPlayIndex

  // Create audio element once on mount. All handlers read latest callbacks via refs.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "auto"
    audioRef.current = audio

    const onTimeUpdate = () => setPosition(audio.currentTime * 1000)
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration * 1000)
    }
    const onPlay = () => {
      setIsPlaying(true)
      startTimelineReportingRef.current()
    }
    const onPause = () => {
      setIsPlaying(false)
      reportTimelineRef.current("paused")
    }
    const onEnded = () => {
      stopTimelineReportingRef.current()
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        loadAndPlayIndexRef.current(nextIdx)
      } else {
        setIsPlaying(false)
        setCurrentTrack(null)
        currentIndexRef.current = -1
      }
    }
    const onError = () => {
      const msg = audio.error ? `Audio error: ${audio.error.message}` : "Unknown audio error"
      console.error("[PlexAudio] audio element error:", msg, audio.error)
      setError(msg)
      stopTimelineReportingRef.current()
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        loadAndPlayIndexRef.current(nextIdx)
      } else {
        setIsPlaying(false)
        setCurrentTrack(null)
      }
    }

    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("durationchange", onDurationChange)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("error", onError)

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("durationchange", onDurationChange)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("error", onError)
      stopTimelineReportingRef.current()
      audio.pause()
      audio.src = ""
    }
  }, [])

  // Clean up timeline reporting on unmount.
  useEffect(() => {
    return () => {
      if (timelineIntervalRef.current) {
        clearInterval(timelineIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const playTrack = useCallback(async (track: PlexTrackInfo) => {
    queueRef.current = [track]
    setQueue([track])
    setError(null)
    await loadAndPlayIndexRef.current(0, true)
  }, [])

  const playAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex = 0) => {
    if (tracks.length === 0) return
    queueRef.current = tracks
    setQueue(tracks)
    setError(null)
    await loadAndPlayIndexRef.current(startIndex, true)
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  const seek = useCallback((ms: number) => {
    if (audioRef.current) audioRef.current.currentTime = ms / 1000
  }, [])

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol))
    setVolumeState(clamped)
    localStorage.setItem(VOLUME_KEY, String(clamped))
  }, [])

  const skipNext = useCallback(async () => {
    stopTimelineReportingRef.current()
    await loadAndPlayIndexRef.current(currentIndexRef.current + 1)
  }, [])

  const skipPrevious = useCallback(async () => {
    stopTimelineReportingRef.current()
    const prevIdx = currentIndexRef.current - 1
    if (prevIdx >= 0) {
      await loadAndPlayIndexRef.current(prevIdx)
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [])

  const skipToIndex = useCallback((index: number) => {
    stopTimelineReportingRef.current()
    loadAndPlayIndexRef.current(index)
  }, [])

  const stop = useCallback(() => {
    stopTimelineReportingRef.current()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ""
    }
    setIsPlaying(false)
    setCurrentTrack(null)
    setPosition(0)
    setDuration(0)
    queueRef.current = []
    setQueue([])
    setError(null)
    currentIndexRef.current = -1
  }, [])

  const previousTracks = queue.slice(0, Math.max(0, currentIndexRef.current))

  return (
    <PlexPlayerContext.Provider
      value={{
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
      }}
    >
      {children}
    </PlexPlayerContext.Provider>
  )
}

export function usePlexPlayer(): PlexPlayerContextValue {
  const ctx = useContext(PlexPlayerContext)
  if (!ctx) throw new Error("usePlexPlayer must be used within PlexAudioProvider")
  return ctx
}
