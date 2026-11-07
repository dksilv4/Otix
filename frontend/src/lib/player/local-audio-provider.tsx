import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalTrackInfo, RepeatMode } from './types'
import { LocalPlayerContext, playerProgressStore } from './player-context'
import { LOCAL_PLAYER_VOLUME_KEY } from './utils'

export const LocalAudioProvider = ({ children }: { children: React.ReactNode }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState<LocalTrackInfo | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_PLAYER_VOLUME_KEY)
      return saved ? parseFloat(saved) : 0.7
    } catch {
      return 0.7
    }
  })
  const [queue, setQueue] = useState<LocalTrackInfo[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>('off')
  const [isShuffled, setIsShuffled] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queueRef = useRef<LocalTrackInfo[]>([])
  const currentIndexRef = useRef(-1)
  const repeatModeRef = useRef<RepeatMode>('off')
  const originalQueueRef = useRef<LocalTrackInfo[]>([])
  const consecutiveErrorCountRef = useRef(0)
  const isPlayingRef = useRef(false)
  const currentTrackRef = useRef<LocalTrackInfo | null>(null)
  const durationRef = useRef(0)

  useEffect(() => {
    currentTrackRef.current = currentTrack
  }, [currentTrack])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const loadAndPlayIndex = useCallback(async (index: number, autoPlay = true) => {
    const list = queueRef.current
    if (index < 0 || index >= list.length) {
      if (repeatModeRef.current === 'all' && list.length > 0) {
        index = 0
      } else {
        isPlayingRef.current = false
        setIsPlaying(false)
        audioRef.current?.pause()
        if (audioRef.current) audioRef.current.currentTime = 0
        setPosition(0)
        setCurrentIndex(0)
        if (list.length > 0) {
          setCurrentTrack(list[0])
        } else {
          setCurrentTrack(null)
          setCurrentIndex(-1)
        }
        return
      }
    }

    const track = list[index]
    if (!track) return

    currentIndexRef.current = index
    setCurrentIndex(index)
    setCurrentTrack(track)
    setPosition(0)
    setError(null)

    const audio = audioRef.current
    if (!audio) return

    if (!track.url) {
      const msg = 'Unable to play track: Audio file is not accessible. Please re-select the folder.'
      console.warn('[LocalAudio]', msg, track)
      setError(msg)
      setIsPlaying(false)
      return
    }

    try {
      audio.src = track.url
      audio.currentTime = 0
      if (autoPlay) {
        await audio.play()
        consecutiveErrorCountRef.current = 0
      } else {
        isPlayingRef.current = false
        setIsPlaying(false)
        audio.pause()
      }
      playerProgressStore.setProgress(0, track.durationMs || 0)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[LocalAudio] play() failed:', msg)
      setError(msg)
    }
  }, [])

  const loadAndPlayIndexRef = useRef(loadAndPlayIndex)
  useEffect(() => {
    loadAndPlayIndexRef.current = loadAndPlayIndex
  }, [loadAndPlayIndex])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = volume
    audioRef.current = audio

    const onTimeUpdate = () => {
      const pos = Math.round(audio.currentTime * 1000)
      const dur = isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : (currentTrackRef.current?.durationMs || durationRef.current || 0)
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
      isPlayingRef.current = true
      setIsPlaying(true)
      consecutiveErrorCountRef.current = 0
    }

    const onPause = () => {
      isPlayingRef.current = false
      setIsPlaying(false)
    }

    const onEnded = () => {
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
        // Prevent last-track queue deadlock: reset to start at position 0, ready to play
        setIsPlaying(false)
        audio.pause()
        audio.currentTime = 0
        setPosition(0)
        setCurrentIndex(0)
        if (queueRef.current.length > 0) {
          setCurrentTrack(queueRef.current[0])
        }
      }
    }

    const onError = () => {
      const msg = audio.error ? `Audio error: ${audio.error.message}` : 'Unknown audio error'
      console.error('[LocalAudio] audio element error:', msg)
      setError(msg)

      consecutiveErrorCountRef.current++
      // Halt if consecutive errors equal or exceed queue length to prevent infinite loops under repeat-all
      if (consecutiveErrorCountRef.current >= Math.max(1, queueRef.current.length)) {
        console.warn('[LocalAudio] All tracks in queue failed to load. Halting playback.')
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

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.src = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const playTrack = useCallback(async (track: LocalTrackInfo) => {
    originalQueueRef.current = [track]
    queueRef.current = [track]
    setQueue([track])
    setIsShuffled(false)
    setError(null)
    await loadAndPlayIndexRef.current(0)
  }, [])

  const playTracks = useCallback(async (tracks: LocalTrackInfo[], startIndex = 0) => {
    if (tracks.length === 0) return
    originalQueueRef.current = [...tracks]
    queueRef.current = [...tracks]
    setQueue([...tracks])
    setIsShuffled(false)
    setError(null)
    await loadAndPlayIndexRef.current(startIndex)
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
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000
      setPosition(ms)
      playerProgressStore.setProgress(ms, duration || (currentTrack?.durationMs ?? 0))
    }
  }, [currentTrack?.durationMs, duration])

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol))
    setVolumeState(clamped)
    try {
      localStorage.setItem(LOCAL_PLAYER_VOLUME_KEY, String(clamped))
    } catch {
      // Ignore storage write errors
    }
  }, [])

  const skipNext = useCallback(async () => {
    const nextIdx = currentIndexRef.current + 1
    if (nextIdx < queueRef.current.length) {
      await loadAndPlayIndexRef.current(nextIdx)
    } else if (repeatModeRef.current === 'all' && queueRef.current.length > 0) {
      await loadAndPlayIndexRef.current(0)
    }
  }, [])

  const skipPrevious = useCallback(async () => {
    const prevIdx = currentIndexRef.current - 1
    if (prevIdx >= 0) {
      await loadAndPlayIndexRef.current(prevIdx)
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [])

  const skipToIndex = useCallback((index: number) => {
    void loadAndPlayIndexRef.current(index)
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ''
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
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    const currentQ = queueRef.current
    if (index < 0 || index >= currentQ.length) return

    const itemToRemove = currentQ[index]
    const updated = currentQ.filter((_, i) => i !== index)
    queueRef.current = updated
    setQueue(updated)

    // Synchronize originalQueueRef so toggling shuffle off does not resurrect deleted tracks.
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
        void loadAndPlayIndexRef.current(nextIdx, isPlayingRef.current)
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
    <LocalPlayerContext.Provider
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
        playTracks,
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
    </LocalPlayerContext.Provider>
  )
}
