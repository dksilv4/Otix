import { useCallback, useEffect, useRef, useState } from "react"
import { getPlexClientId, generateSessionId, PLEX_PLAYER_VOLUME_KEY } from "./utils"
import type { PlexTrackInfo, RepeatMode } from "./types"
export type { PlexTrackInfo, RepeatMode }
import { PlexPlayerContext, playerProgressStore } from "./player-context"

export const PlexAudioProvider = ({ children }: { children: React.ReactNode }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<PlexTrackInfo | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem(PLEX_PLAYER_VOLUME_KEY)
    return saved ? parseFloat(saved) : 0.7
  })
  const [queue, setQueue] = useState<PlexTrackInfo[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('off')
  const [isShuffled, setIsShuffled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queueRef = useRef<PlexTrackInfo[]>([])
  const originalQueueRef = useRef<PlexTrackInfo[]>([])
  const currentIndexRef = useRef(-1)
  const repeatModeRef = useRef<RepeatMode>('off')
  const activeRequestIdRef = useRef(0)
  const consecutiveErrorCountRef = useRef(0)

  // Plex session identifiers for timeline reporting
  const clientIdRef = useRef(getPlexClientId())
  const sessionIdRef = useRef("")
  const commandIdRef = useRef(0)
  const timelineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timelineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref holders for state consumed by stable callbacks.
  const durationRef = useRef(duration)
  const isPlayingRef = useRef(isPlaying)

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Resolve a Plex track's Part key (direct file URL) from its metadata.
  const resolvePartUrl = useCallback(async (track: PlexTrackInfo): Promise<string> => {
    const baseUrl = track.plexBaseUrl
    const token = track.plexToken
    if (!baseUrl || !token) {
      throw new Error("Missing Plex connection info. Try re-syncing your Plex library in Settings.")
    }

    const buildStreamUrl = (partKey: string): string => {
      const params = new URLSearchParams()
      params.set("X-Plex-Token", token)
      params.set("X-Plex-Client-Identifier", clientIdRef.current)
      if (sessionIdRef.current) {
        params.set("X-Plex-Session-Identifier", sessionIdRef.current)
        params.set("X-Plex-Playback-Session-Id", sessionIdRef.current)
      }
      params.set("X-Plex-Product", "Otix")
      params.set("X-Plex-Platform", "Web")
      const cleanBase = baseUrl.replace(/\/+$/, "")
      const cleanPart = partKey.startsWith("/") ? partKey : `/${partKey}`
      return `${cleanBase}${cleanPart}?${params.toString()}`
    }

    // Direct part streaming: if partKey is present, construct stream URL directly with zero extra network round-trips
    if (track.partKey) {
      return buildStreamUrl(track.partKey)
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

    return buildStreamUrl(part.key)
  }, [])

  // Stable refs for callbacks used by the audio event handlers.
  const loadAndPlayIndexRef = useRef<
    (index: number, startNewSession?: boolean, autoPlay?: boolean) => Promise<void>
  >(async () => {})
  const reportTimelineRef = useRef<(state: "playing" | "paused" | "stopped" | "buffering") => void>(() => {})

  const clearTimelineTimers = useCallback(() => {
    if (timelineTimeoutRef.current) {
      clearTimeout(timelineTimeoutRef.current)
      timelineTimeoutRef.current = null
    }
    if (timelineIntervalRef.current) {
      clearInterval(timelineIntervalRef.current)
      timelineIntervalRef.current = null
    }
  }, [])

  // Report playback state to Plex so it appears on the dashboard.
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
    params.set("hasMDE", "1")
    params.set("X-Plex-Token", track.plexToken)
    params.set("X-Plex-Client-Identifier", clientIdRef.current)
    if (sessionIdRef.current) {
      params.set("X-Plex-Session-Identifier", sessionIdRef.current)
      params.set("X-Plex-Playback-Session-Id", sessionIdRef.current)
    }
    params.set("X-Plex-Product", "Otix")
    params.set("X-Plex-Version", "1.0.0")
    params.set("X-Plex-Platform", "Web")
    params.set("X-Plex-Device", "Browser")

    const url = `${track.plexBaseUrl}/:/timeline?${params.toString()}`

    fetch(url, {
      method: "GET",
      mode: "no-cors",
      keepalive: state === "stopped",
    }).catch(() => {})
  }, [])

  useEffect(() => {
    reportTimelineRef.current = reportTimeline
  }, [reportTimeline])

  // Start periodic timeline reporting while playing.
  const startTimelineReporting = useCallback(() => {
    clearTimelineTimers()
    reportTimelineRef.current("buffering")
    timelineTimeoutRef.current = setTimeout(() => {
      timelineTimeoutRef.current = null
      reportTimelineRef.current("playing")
    }, 500)
    timelineIntervalRef.current = setInterval(() => {
      reportTimelineRef.current("playing")
    }, 5000)
  }, [clearTimelineTimers])

  const stopTimelineReporting = useCallback(() => {
    clearTimelineTimers()
    reportTimelineRef.current("stopped")
  }, [clearTimelineTimers])

  // Load and play a track by queue index with monotonic request sequence tracking.
  const loadAndPlayIndex = useCallback(async (index: number, startNewSession = false, autoPlay = true) => {
    const audio = audioRef.current
    if (!audio) return
    const q = queueRef.current
    if (index < 0 || index >= q.length) return

    const track = q[index]
    const requestId = ++activeRequestIdRef.current

    currentIndexRef.current = index
    setCurrentIndex(index)
    setCurrentTrack(track)
    setPosition(0)
    setError(null)

    try {
      if (startNewSession || !sessionIdRef.current) {
        sessionIdRef.current = generateSessionId()
        commandIdRef.current = 0
      }

      const streamUrl = await resolvePartUrl(track)
      // Discard stale in-flight request if another track was requested
      if (activeRequestIdRef.current !== requestId) return

      audio.src = streamUrl
      audio.currentTime = 0
      if (autoPlay) {
        await audio.play()
        if (activeRequestIdRef.current === requestId) {
          consecutiveErrorCountRef.current = 0
          playerProgressStore.setProgress(0, track.durationMs || 0)
        }
      } else {
        isPlayingRef.current = false
        setIsPlaying(false)
        audio.pause()
        clearTimelineTimers()
        reportTimelineRef.current("paused")
        if (activeRequestIdRef.current === requestId) {
          playerProgressStore.setProgress(0, track.durationMs || 0)
        }
      }
    } catch (e: unknown) {
      if (activeRequestIdRef.current !== requestId) return
      if (e instanceof DOMException && e.name === "AbortError") return
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[PlexAudio] play() failed:", msg)
      setError(msg)
    }
  }, [clearTimelineTimers, resolvePartUrl])

  useEffect(() => {
    loadAndPlayIndexRef.current = loadAndPlayIndex
  }, [loadAndPlayIndex])

  // Create audio element once on mount. All handlers read latest callbacks via refs.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "auto"
    audio.volume = volume
    audioRef.current = audio

    const onTimeUpdate = () => {
      const pos = Math.round(audio.currentTime * 1000)
      const dur = isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : (durationRef.current || 0)
      playerProgressStore.setProgress(pos, dur)
    }
    const onDurationChange = () => {
      if (isFinite(audio.duration)) {
        const dur = Math.round(audio.duration * 1000)
        setDuration(dur)
        playerProgressStore.setProgress(Math.round(audio.currentTime * 1000), dur)
      }
    }
    const onPlay = () => {
      setIsPlaying(true)
      startTimelineReporting()
    }
    const onPause = () => {
      setIsPlaying(false)
      clearTimelineTimers()
      reportTimelineRef.current("paused")
    }
    const onEnded = () => {
      stopTimelineReporting()
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0
        audio.play().catch((err) => {
          console.warn('[Audio] Loop play rejected:', err)
        })
        return
      }
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        void loadAndPlayIndexRef.current(nextIdx)
      } else if (repeatModeRef.current === 'all' && queueRef.current.length > 0) {
        void loadAndPlayIndexRef.current(0)
      } else {
        setIsPlaying(false)
        audio.pause()
        audio.currentTime = 0
        setCurrentIndex(0)
        if (queueRef.current.length > 0) {
          setCurrentTrack(queueRef.current[0])
        }
      }
    }
    const onError = () => {
      const msg = audio.error ? `Audio error: ${audio.error.message}` : "Unknown audio error"
      console.error("[PlexAudio] audio element error:", msg, audio.error)
      setError(msg)
      stopTimelineReporting()

      consecutiveErrorCountRef.current++
      if (consecutiveErrorCountRef.current >= Math.max(1, queueRef.current.length)) {
        console.warn('[PlexAudio] All tracks in queue failed to load. Halting playback.')
        setIsPlaying(false)
        consecutiveErrorCountRef.current = 0
        return
      }

      const nextIdx = currentIndexRef.current + 1
      if (nextIdx < queueRef.current.length) {
        void loadAndPlayIndexRef.current(nextIdx)
      } else if (repeatModeRef.current === 'all' && queueRef.current.length > 0) {
        void loadAndPlayIndexRef.current(0)
      } else {
        setIsPlaying(false)
        consecutiveErrorCountRef.current = 0
        setCurrentIndex(0)
        if (queueRef.current.length > 0) {
          setCurrentTrack(queueRef.current[0])
        }
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
      stopTimelineReporting()
      audio.pause()
      audio.src = ""
    }
  }, [clearTimelineTimers, startTimelineReporting, stopTimelineReporting])

  // Clean up timeline reporting on unmount.
  useEffect(() => {
    return () => {
      clearTimelineTimers()
    }
  }, [clearTimelineTimers])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const playTrack = useCallback(async (track: PlexTrackInfo) => {
    stopTimelineReporting()
    originalQueueRef.current = [track]
    queueRef.current = [track]
    setQueue([track])
    setIsShuffled(false)
    setError(null)
    await loadAndPlayIndexRef.current(0, true)
  }, [stopTimelineReporting])

  const playAlbum = useCallback(async (tracks: PlexTrackInfo[], startIndex = 0) => {
    if (tracks.length === 0) return
    stopTimelineReporting()
    originalQueueRef.current = [...tracks]
    queueRef.current = [...tracks]
    setQueue([...tracks])
    setIsShuffled(false)
    setError(null)
    await loadAndPlayIndexRef.current(startIndex, true)
  }, [stopTimelineReporting])

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
    clearTimelineTimers()
    audioRef.current?.pause()
  }, [clearTimelineTimers])

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  const seek = useCallback((ms: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000
      setPosition(ms)
      playerProgressStore.setProgress(ms, durationRef.current || 0)
    }
  }, [])

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol))
    setVolumeState(clamped)
    try {
      localStorage.setItem(PLEX_PLAYER_VOLUME_KEY, String(clamped))
    } catch {
      // ignore
    }
  }, [])

  const skipNext = useCallback(async () => {
    stopTimelineReporting()
    const nextIdx = currentIndexRef.current + 1
    if (nextIdx < queueRef.current.length) {
      await loadAndPlayIndexRef.current(nextIdx)
    } else if (repeatModeRef.current === 'all' && queueRef.current.length > 0) {
      await loadAndPlayIndexRef.current(0)
    }
  }, [stopTimelineReporting])

  const skipPrevious = useCallback(async () => {
    stopTimelineReporting()
    const prevIdx = currentIndexRef.current - 1
    if (prevIdx >= 0) {
      await loadAndPlayIndexRef.current(prevIdx)
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [stopTimelineReporting])

  const skipToIndex = useCallback((index: number) => {
    stopTimelineReporting()
    loadAndPlayIndexRef.current(index)
  }, [stopTimelineReporting])

  const stop = useCallback(() => {
    stopTimelineReporting()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ""
    }
    setIsPlaying(false)
    setCurrentTrack(null)
    setPosition(0)
    setDuration(0)
    playerProgressStore.setProgress(0, 0)
    queueRef.current = []
    originalQueueRef.current = []
    setQueue([])
    setError(null)
    currentIndexRef.current = -1
    setCurrentIndex(-1)
  }, [stopTimelineReporting])

  const removeFromQueue = useCallback((index: number) => {
    const currentQ = queueRef.current
    if (index < 0 || index >= currentQ.length) return

    const itemToRemove = currentQ[index]
    const updated = currentQ.filter((_, i) => i !== index)
    queueRef.current = updated
    setQueue(updated)

    // Keep originalQueueRef synchronized so un-shuffle does not resurrect deleted tracks.
    // Splice out only the single matching instance to prevent purging duplicate tracks in queue.
    const origIdx = originalQueueRef.current.findIndex((t) => t.id === itemToRemove.id)
    if (origIdx !== -1) {
      originalQueueRef.current.splice(origIdx, 1)
    }

    const currIdx = currentIndexRef.current
    if (index === currIdx) {
      if (updated.length === 0) {
        stop()
      } else {
        const nextIdx = index < updated.length ? index : 0
        void loadAndPlayIndexRef.current(nextIdx, false, isPlayingRef.current)
      }
    } else if (index < currIdx) {
      currentIndexRef.current = currIdx - 1
      setCurrentIndex(currIdx - 1)
    }
  }, [stop])

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    const currentQ = queueRef.current
    if (fromIndex < 0 || fromIndex >= currentQ.length || toIndex < 0 || toIndex >= currentQ.length) return
    const item = currentQ[fromIndex]
    const updated = [...currentQ]
    updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, item)
    queueRef.current = updated
    setQueue(updated)

    if (!isShuffled) {
      originalQueueRef.current = [...updated]
    }

    const currIdx = currentIndexRef.current
    if (fromIndex === currIdx) {
      currentIndexRef.current = toIndex
      setCurrentIndex(toIndex)
    } else if (fromIndex < currIdx && toIndex >= currIdx) {
      currentIndexRef.current = currIdx - 1
      setCurrentIndex(currIdx - 1)
    } else if (fromIndex > currIdx && toIndex <= currIdx) {
      currentIndexRef.current = currIdx + 1
      setCurrentIndex(currIdx + 1)
    }
  }, [isShuffled])

  const toggleShuffle = useCallback(() => {
    setIsShuffled((prev) => {
      const next = !prev
      if (next) {
        const curr = queueRef.current[currentIndexRef.current]
        const remaining = queueRef.current.filter((_, i) => i !== currentIndexRef.current)
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]]
        }
        const shuffled = curr ? [curr, ...remaining] : remaining
        queueRef.current = shuffled
        setQueue(shuffled)
        const newIdx = curr ? 0 : -1
        currentIndexRef.current = newIdx
        setCurrentIndex(newIdx)
      } else {
        const original = originalQueueRef.current
        if (original.length > 0) {
          const curr = queueRef.current[currentIndexRef.current]
          const origIdx = curr ? original.findIndex((t) => t.id === curr.id) : -1
          queueRef.current = [...original]
          setQueue([...original])
          const newIdx = origIdx >= 0 ? origIdx : 0
          currentIndexRef.current = newIdx
          setCurrentIndex(newIdx)
        }
      }
      return next
    })
  }, [])

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    repeatModeRef.current = mode
    setRepeatModeState(mode)
  }, [])

  const previousTracks = queue.slice(0, Math.max(0, currentIndex))

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
        repeatMode,
        isShuffled,
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
        removeFromQueue,
        moveQueueItem,
        toggleShuffle,
        setRepeatMode,
        stop,
      }}
    >
      {children}
    </PlexPlayerContext.Provider>
  )
}
