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
  stop: () => void
}

const PlexPlayerContext = createContext<PlexPlayerContextValue | null>(null)

const VOLUME_KEY = "plex-player-volume"

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
  const currentBlobUrlRef = useRef<string | null>(null)

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

  // Fetch Plex audio as a blob and create a same-origin blob URL.
  const fetchAsBlobUrl = useCallback(async (track: PlexTrackInfo): Promise<string> => {
    const url = await resolvePartUrl(track)
    const resp = await fetch(url)
    if (!resp.ok) {
      const text = await resp.text().catch(() => "(no body)")
      throw new Error(`Plex returned ${resp.status}: ${text.slice(0, 200)}`)
    }
    const blob = await resp.blob()
    if (blob.size === 0) throw new Error("Plex returned empty response")
    return URL.createObjectURL(blob)
  }, [resolvePartUrl])

  const loadAndPlayIndex = useCallback(async (index: number) => {
    const audio = audioRef.current
    if (!audio) return
    const q = queueRef.current
    if (index < 0 || index >= q.length) return

    const track = q[index]
    currentIndexRef.current = index
    setCurrentTrack(track)
    setError(null)

    try {
      const blobUrl = await fetchAsBlobUrl(track)

      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = blobUrl

      audio.src = blobUrl
      await audio.play()
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error("[PlexAudio] play() failed:", msg)
      setError(msg)
    }
  }, [fetchAsBlobUrl])

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "auto"
    audioRef.current = audio

    const onTimeUpdate = () => setPosition(audio.currentTime * 1000)
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration * 1000)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        loadAndPlayIndex(nextIdx)
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
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        loadAndPlayIndex(nextIdx)
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
      audio.pause()
      audio.src = ""
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
        currentBlobUrlRef.current = null
      }
    }
  }, [loadAndPlayIndex])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const playTrack = useCallback(async (track: PlexTrackInfo) => {
    queueRef.current = [track]
    setQueue([track])
    currentIndexRef.current = 0
    setCurrentTrack(track)
    setError(null)
    const audio = audioRef.current
    if (!audio) return
    try {
      const blobUrl = await fetchAsBlobUrl(track)

      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = blobUrl

      audio.src = blobUrl
      await audio.play()
    } catch (e: any) {
      console.error("[PlexAudio] playTrack failed:", e?.message || String(e))
      setError(e?.message || String(e))
    }
  }, [fetchAsBlobUrl])

  const playAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex = 0) => {
    if (tracks.length === 0) return
    queueRef.current = tracks
    setQueue(tracks)
    setError(null)
    await loadAndPlayIndex(startIndex)
  }, [loadAndPlayIndex])

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
    await loadAndPlayIndex(currentIndexRef.current + 1)
  }, [loadAndPlayIndex])

  const skipPrevious = useCallback(async () => {
    const prevIdx = currentIndexRef.current - 1
    if (prevIdx >= 0) {
      await loadAndPlayIndex(prevIdx)
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [loadAndPlayIndex])

  const stop = useCallback(() => {
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
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = null
    }
  }, [])

  return (
    <PlexPlayerContext.Provider
      value={{
        isPlaying,
        currentTrack,
        position,
        duration,
        volume,
        queue,
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
