import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  ChevronLeft,
  Clock,
  Download,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayer } from './use-player'
import { usePalette, rgbCss, rgbaCss } from './use-palette'
import { PlexSessionList } from './plex-now-playing'
import type { PlexSession } from './plex-now-playing'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'
import { SpotifyIcon } from '@/features/dk-ui/atoms/spotify-icon'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { cn } from '@/lib/utils'

// ── helpers ──

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

interface PersonListResponse {
  items: Array<{ id: string; name: string }>
}

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

// ── Now Playing View ──

const PANEL_WIDTH = 340
const PANEL_MARGIN = 16

export interface NowPlayingViewProps {
  open: boolean
  onClose: () => void
}

export function NowPlayingView({ open, onClose }: NowPlayingViewProps) {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const {
    source,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    spotifyNextTracks,
    spotifyPreviousTracks,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    playSpotify,
    plexQueue,
    plexPreviousTracks,
    skipPlexToIndex,
  } = usePlayer()

  const hasScrolledRef = useRef(false)

  const queueItems = source === 'plex'
    ? plexQueue.slice(1)
    : spotifyNextTracks

  const prevItems = (source === 'plex'
    ? plexPreviousTracks
    : spotifyPreviousTracks
  ).filter(item => {
    if (!currentTrack) return true
    const itemUri = 'uri' in item ? (item as any).uri : undefined
    const itemId = item.id
    if (itemId && itemId === currentTrack.id) return false
    if (itemUri && itemUri === currentTrack.uri) return false
    return true
  })

  const [showQueue, setShowQueue] = useState(false)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const queueContainerRef = useRef<HTMLDivElement>(null)
  const upNextContainerRef = useRef<HTMLDivElement>(null)

  const palette = usePalette(currentTrack?.albumArt ?? null)
  const backgroundColor = rgbaCss(palette.background, 0.92)
  const surfaceColor = rgbaCss(palette.surface, 0.88)
  const accentColor = rgbCss(palette.accent)

  // Plex sessions
  const { data: plexSessions = [] } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/auth/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: !!currentUser?.plexId,
  })

  // Active & Recent downloads
  const { downloads, cancelDownload } = useDownloads(currentUser?.id)
  const activeAndRecentDownloads = downloads
    .filter(d => {
      if (d.status === 'queued' || d.status === 'downloading' || d.status === 'processing') return true
      if (d.status === 'failed') return true
      if (d.status === 'completed' && d.completedAt) {
        const completedTime = new Date(d.completedAt).getTime()
        const fifteenMinsAgo = Date.now() - 15 * 60 * 1000
        return completedTime > fifteenMinsAgo
      }
      return false
    })
    .sort((a, b) => {
      const getProgress = (item: typeof a) => {
        if (item.status === 'completed') return 100
        return item.percentage ?? 0
      }
      return getProgress(b) - getProgress(a)
    })
  const hasDownloads = activeAndRecentDownloads.length > 0

  // Close volume slider on click outside
  useEffect(() => {
    if (!showVolumeSlider) return
    const onClick = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showVolumeSlider])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        togglePlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, togglePlay, onClose])

  // Auto-scroll to top when track, queue toggle, or open state changes
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = 0
    }
  }, [showQueue, currentTrack?.id, open])

  // Reset scroll state when track, open status, or showQueue changes
  useEffect(() => {
    hasScrolledRef.current = false
  }, [currentTrack?.id, open, showQueue])

  // Scroll queue container to Up Next section so Previously played is hidden but scrollable-to
  useEffect(() => {
    if (!hasScrolledRef.current && queueContainerRef.current && upNextContainerRef.current) {
      const timer = requestAnimationFrame(() => {
        if (queueContainerRef.current && upNextContainerRef.current) {
          queueContainerRef.current.scrollTop = upNextContainerRef.current.offsetTop
          if (prevItems.length > 0 || (queueItems.length === 0 && prevItems.length === 0)) {
            hasScrolledRef.current = true
          }
        }
      })
      return () => cancelAnimationFrame(timer)
    }
  }, [prevItems.length, queueItems.length, currentTrack?.id, open, showQueue])

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsDraggingProgress(true)
    updateProgressFromEvent(e)
  }

  const handleProgressMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingProgress) return
    updateProgressFromEvent(e)
  }

  const handleProgressMouseUp = (e: React.MouseEvent) => {
    if (!isDraggingProgress) return
    setIsDraggingProgress(false)
    updateProgressFromEvent(e)
  }

  const updateProgressFromEvent = (e: React.MouseEvent) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect) return
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    seek(Math.floor(fraction * (duration || 0)))
  }

  const progress = duration > 0 ? position / duration : 0

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const handleQueueItemClick = async (item: { uri?: string; id?: string }, displayIndex: number) => {
    if (source === 'spotify' && item.uri) {
      try {
        await playSpotify(item.uri)
      } catch (e) {
        console.error('Queue click play failed:', e)
      }
    } else if (source === 'plex') {
      skipPlexToIndex(displayIndex + 1)
    }
  }

  const handlePrevItemClick = async (item: { uri?: string; id?: string }) => {
    if (source === 'spotify' && item.uri) {
      try {
        await playSpotify(item.uri)
      } catch (e) {
        console.error('Prev click play failed:', e)
      }
    }
  }

  const handleArtistClick = async (artistName: string) => {
    try {
      const { data } = await apiClient.get<PersonListResponse>('/person/search', {
        params: { q: artistName, limit: 5 },
      })
      const person = data.items.find(
        (item) => item.name.toLowerCase() === artistName.toLowerCase(),
      ) ?? data.items[0]
      if (person) {
        navigate({ to: '/person/$personId', params: { personId: person.id }, search: {} })
      }
    } catch { /* ignore */ }
  }

  if (!open) return null

  const artists = currentTrack
    ? currentTrack.artists.length > 0
      ? currentTrack.artists
      : currentTrack.artist
        ? [{ name: currentTrack.artist, uri: '' }]
        : []
    : []

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="activity-panel"
          initial={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'fixed flex flex-col overflow-y-auto',
            'space-y-4',
          )}
          style={{
            width: PANEL_WIDTH,
            right: PANEL_MARGIN,
            top: 76, // 60px (nav bottom) + 16px (uniform margin)
            maxHeight: `calc(100vh - 76px - ${PANEL_MARGIN}px)`,
            zIndex: 9998,
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.1, right: 0.8 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80 || info.velocity.x > 300) {
              onClose()
            }
          }}
        >
          {/* 1. Music Player Container */}
          {currentTrack && (
            <div
              className="rounded-[2rem] overflow-hidden flex flex-col shadow-[var(--dk-shadow-glass)] backdrop-blur-md shrink-0"
              style={{
                background: `linear-gradient(160deg, ${backgroundColor} 0%, ${surfaceColor} 56%, ${rgbaCss(palette.accent, 0.18)} 100%)`,
                transition: 'background 1s ease',
              }}
            >
              <div ref={scrollRef} className="flex flex-col min-h-0 flex-1 pt-4">
                <AnimatePresence mode="wait">
                  {!showQueue ? (
                    <motion.div
                      key="main"
                      initial={{ x: -60, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -60, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="flex flex-col flex-1"
                    >
                      {/* Album art */}
                      <div className="px-6 pt-2 pb-4 shrink-0">
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden">
                          {currentTrack.albumArt ? (
                            <img
                              src={currentTrack.albumArt}
                              alt={currentTrack.albumName}
                              className={cn(
                                'w-full h-full object-cover rounded-2xl shadow-2xl',
                                isPlaying && 'shadow-purple-500/10',
                              )}
                            />
                          ) : (
                            <div className="w-full h-full rounded-2xl bg-white/[0.04] flex items-center justify-center">
                              <ListMusic className="h-12 w-12 text-muted-foreground/30" />
                            </div>
                          )}
                          {/* Source badge */}
                          <div className="absolute top-2.5 right-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center justify-center rounded-full p-1.5',
                                source === 'spotify'
                                  ? 'bg-[#1DB954]/20 text-[#1DB954]'
                                  : 'bg-amber-500/20 text-amber-400',
                              )}
                            >
                              {source === 'spotify' ? (
                                <SpotifyIcon className="h-3.5 w-3.5" />
                              ) : (
                                <PlexIcon className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Track info */}
                      <div className="px-6 pb-3 shrink-0">
                        <h2 className="text-lg font-semibold leading-tight truncate text-white/95">
                          {currentTrack.title}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-white/55">
                          {artists.map((artist, i) => (
                            <span key={`${artist.uri || artist.name}-${i}`} className="inline-flex items-center">
                              {i > 0 && <span className="mr-1">,</span>}
                              <button
                                type="button"
                                onClick={() => handleArtistClick(artist.name)}
                                className="text-left transition-colors hover:text-white/85 truncate max-w-[180px]"
                              >
                                {artist.name}
                              </button>
                            </span>
                          ))}
                        </div>
                        {currentTrack.albumName && (
                          <p className="mt-0.5 text-xs text-white/40 truncate">
                            {currentTrack.albumName}
                          </p>
                        )}
                      </div>

                      {/* Progress */}
                      <div className="px-6 pb-2 shrink-0">
                        <div
                          ref={progressBarRef}
                          className="relative h-1.5 w-full cursor-pointer group/progress"
                          onMouseDown={handleProgressMouseDown}
                          onMouseMove={handleProgressMouseMove}
                          onMouseUp={handleProgressMouseUp}
                          onMouseLeave={() => setIsDraggingProgress(false)}
                        >
                          <div className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.08]">
                            <div
                              className="h-full rounded-full transition-colors"
                              style={{
                                width: `${progress * 100}%`,
                                backgroundColor: accentColor,
                              }}
                            />
                          </div>
                          {(progress > 0.01 || isDraggingProgress) && (
                            <div
                              className={cn(
                                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
                                'h-3.5 w-3.5 rounded-full shadow-lg',
                                'opacity-0 group-hover/progress:opacity-100 transition-opacity',
                                isDraggingProgress && 'opacity-100',
                              )}
                              style={{
                                left: `${progress * 100}%`,
                                backgroundColor: accentColor,
                              }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between mt-1 text-[11px] font-mono tabular-nums text-white/30">
                          <span>{formatTime(position)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Controls + Volume */}
                      <div className={cn(
                        "relative flex items-center justify-center gap-3 px-6 shrink-0",
                        !(queueItems.length === 0 && prevItems.length === 0) ? "pb-4" : "pb-6"
                      )}>
                        <button
                          type="button"
                          onClick={skipPrevious}
                          className="h-10 w-10 inline-flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                          title="Previous"
                        >
                          <SkipBack className="h-5 w-5" />
                        </button>

                        <button
                          type="button"
                          onClick={togglePlay}
                          className="h-14 w-14 inline-flex items-center justify-center rounded-full transition-all active:scale-95"
                          style={{
                            backgroundColor: accentColor,
                            color: palette.accentText,
                          }}
                          title={isPlaying ? 'Pause' : 'Play'}
                        >
                          {isPlaying ? (
                            <Pause className="h-6 w-6" />
                          ) : (
                            <Play className="h-6 w-6 ml-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={skipNext}
                          className="h-10 w-10 inline-flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                          title="Next"
                        >
                          <SkipForward className="h-5 w-5" />
                        </button>

                        {/* Volume — icon only, click shows slider */}
                        <div ref={volumeRef} className="absolute right-6">
                          <button
                            type="button"
                            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                          >
                            <VolumeIcon className="h-4 w-4" />
                          </button>
                          <AnimatePresence>
                            {showVolumeSlider && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.92 }}
                                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute right-0 bottom-full mb-2 rounded-xl border border-white/[0.08] backdrop-blur-md px-3 py-2.5 shadow-xl"
                                style={{
                                  background: `linear-gradient(135deg, ${rgbaCss(palette.background, 0.98)}, ${rgbaCss(palette.surface, 0.96)})`,
                                }}
                              >
                                <div className="relative h-1.5 w-28 cursor-pointer" title="Volume">
                                  <div
                                    className="absolute inset-0 rounded-full bg-white/[0.12]"
                                    onClick={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                                      setVolume(fraction)
                                    }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${volume * 100}%`,
                                        backgroundColor: accentColor,
                                      }}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Queue — preview inside player */}
                      {!(queueItems.length === 0 && prevItems.length === 0) && (
                        <div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
                          <div className="flex items-center gap-2 mb-2 shrink-0">
                            <ListMusic className="h-3.5 w-3.5 text-white/40" />
                            <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                              Up next
                            </h3>
                            {queueItems.length > 0 && (
                              <span className="text-[10px] text-white/25 ml-auto">
                                {queueItems.length}
                              </span>
                            )}
                          </div>

                          <div ref={queueContainerRef} className="relative overflow-y-auto flex-1 min-h-0 space-y-0.5 max-h-[160px]">
                            {/* Previously played */}
                            {prevItems.length > 0 && (
                              <>
                                <div className="flex items-center gap-2 mb-1 pt-1">
                                  <Clock className="h-3 w-3 text-white/25" />
                                  <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">
                                    Previously played
                                  </span>
                                </div>
                                {prevItems.map((item, i) => (
                                  <button
                                    key={`prev-${item.id || (item as any).uri}-${i}`}
                                    type="button"
                                    onClick={() => handlePrevItemClick(item)}
                                    className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-white/[0.03] transition-colors cursor-pointer group opacity-50 hover:opacity-75"
                                  >
                                    {item.albumArt ? (
                                      <img src={item.albumArt} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                                    ) : (
                                      <div className="h-7 w-7 rounded bg-white/[0.04] shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate text-white/60">{'name' in item ? item.name : item.title}</p>
                                      {'artist' in item && item.artist && (
                                        <p className="text-[10px] text-white/30 truncate">{item.artist}</p>
                                      )}
                                    </div>
                                  </button>
                                ))}
                                <div className="my-1.5 border-t border-white/[0.04]" />
                              </>
                            )}

                            {/* Up next */}
                            <div ref={upNextContainerRef} className="space-y-0.5">
                              {queueItems.map((item, i) => (
                                <button
                                  key={`${item.id || (item as any).uri}-${i}`}
                                  type="button"
                                  onClick={() => handleQueueItemClick(item, i)}
                                  className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors cursor-pointer group text-left"
                                >
                                  {item.albumArt ? (
                                    <img src={item.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
                                  ) : (
                                    <div className="h-9 w-9 rounded-md bg-white/[0.04] shrink-0 flex items-center justify-center">
                                      <ListMusic className="h-4 w-4 text-white/10" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate text-white/80">{'name' in item ? item.name : item.title}</p>
                                    {'artist' in item && item.artist && (
                                      <p className="text-[11px] text-white/35 truncate">{item.artist}</p>
                                    )}
                                  </div>
                                  <Play className="h-3 w-3 text-white/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="queue"
                      initial={{ x: 60, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 60, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="flex flex-col flex-1"
                    >
                      {/* Queue header — back button only */}
                      <div className="flex items-center justify-between px-4 py-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowQueue(false)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Back
                        </button>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">
                          Queue
                        </span>
                        <div className="w-[50px]" />
                      </div>

                      {/* Now playing indicator */}
                      <div className="px-6 pb-4 shrink-0">
                        <div
                          className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                          style={{
                            backgroundColor: rgbaCss(palette.surface, 0.5),
                            borderColor: rgbaCss(palette.accent, 0.15),
                          }}
                        >
                          {currentTrack.albumArt ? (
                            <img src={currentTrack.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded-md bg-white/[0.04] shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate text-white/85">{currentTrack.title}</p>
                            <p className="text-[11px] text-white/40 truncate">{currentTrack.artist}</p>
                          </div>
                          <div className="ml-auto shrink-0">
                            {isPlaying ? (
                              <div className="flex items-end gap-px h-3">
                                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%', backgroundColor: accentColor }} />
                                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_0.15s_infinite]" style={{ height: '100%', backgroundColor: accentColor }} />
                                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_0.3s_infinite]" style={{ height: '40%', backgroundColor: accentColor }} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Previously played */}
                      {prevItems.length > 0 && (
                        <div className="px-6 pb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="h-3.5 w-3.5 text-white/25" />
                            <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/25">
                              Previously played
                            </h3>
                            <span className="text-[10px] text-white/15 ml-auto">{prevItems.length}</span>
                          </div>
                          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
                            {prevItems.map((item, i) => (
                              <button
                                key={`prev-${item.id || (item as any).uri}-${i}`}
                                type="button"
                                onClick={() => handlePrevItemClick(item)}
                                className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-white/[0.03] transition-colors cursor-pointer group opacity-50 hover:opacity-80"
                              >
                                {item.albumArt ? (
                                  <img src={item.albumArt} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                                ) : (
                                  <div className="h-7 w-7 rounded bg-white/[0.04] shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium truncate text-white/60">{'name' in item ? item.name : item.title}</p>
                                  {'artist' in item && item.artist && (
                                    <p className="text-[10px] text-white/30 truncate">{item.artist}</p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Up next — full list */}
                      <div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
                        <div className="flex items-center gap-2 mb-2 shrink-0">
                          <ListMusic className="h-3.5 w-3.5 text-white/40" />
                          <h3 className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                            Up next
                          </h3>
                          {queueItems.length > 0 && (
                            <span className="text-[10px] text-white/25 ml-auto">
                              {queueItems.length} track{queueItems.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {queueItems.length === 0 ? (
                          <p className="text-xs text-white/25 italic">Queue is empty</p>
                        ) : (
                          <div className="space-y-0.5 overflow-y-auto flex-1 min-h-0 max-h-[220px]">
                            {queueItems.map((item, i) => (
                              <button
                                key={`${item.id || (item as any).uri}-${i}`}
                                type="button"
                                onClick={() => handleQueueItemClick(item, i)}
                                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                              >
                                {item.albumArt ? (
                                  <img src={item.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
                                ) : (
                                  <div className="h-9 w-9 rounded-md bg-white/[0.04] shrink-0 flex items-center justify-center">
                                    <ListMusic className="h-4 w-4 text-white/10" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate text-white/80">{'name' in item ? item.name : item.title}</p>
                                  {'artist' in item && item.artist && (
                                    <p className="text-[11px] text-white/35 truncate">{item.artist}</p>
                                  )}
                                </div>
                                <Play className="h-3 w-3 text-white/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* 2. Downloads Container */}
          {hasDownloads && (
            <div className="rounded-[2rem] bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-md p-6 shadow-[var(--dk-shadow-glass)] shrink-0 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                  <Download className="h-4 w-4 text-blue-400" />
                  {activeAndRecentDownloads.some(d => d.status === 'downloading') && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Downloads
                </span>
              </div>
              <div className="space-y-4">
                {activeAndRecentDownloads.map(d => {
                  const isActive = d.status === 'queued' || d.status === 'downloading' || d.status === 'processing'
                  const pct = d.percentage ?? 0
                  
                  // Status config details (strictly colors)
                  let statusIcon = <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                  let progressBg = 'bg-amber-500'

                  if (d.status === 'downloading') {
                    statusIcon = <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                    progressBg = 'bg-gradient-to-r from-blue-500 to-indigo-500'
                  } else if (d.status === 'processing') {
                    statusIcon = <RefreshCw className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
                    progressBg = 'bg-purple-500 animate-pulse'
                  } else if (d.status === 'completed') {
                    statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    progressBg = 'bg-emerald-500'
                  } else if (d.status === 'failed') {
                    statusIcon = <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    progressBg = 'bg-rose-500'
                  }

                  return (
                    <div 
                      key={d.id} 
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-3">
                        {statusIcon}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate text-white/90" title={d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}>
                            {d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}
                          </p>
                          {d.nzbSize ? (
                            <p className="text-[10px] text-white/35 mt-0.5 font-medium">
                              {formatBytes(d.nzbSize)}
                            </p>
                          ) : null}
                        </div>

                        {/* Action buttons (only cancel button on active downloads) */}
                        {isActive && (
                          <div className="shrink-0 flex items-center">
                            <button
                              type="button"
                              onClick={() => cancelDownload(d.id)}
                              className="h-7 w-7 flex items-center justify-center rounded-full text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                              title="Cancel Download"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Error details */}
                      {d.status === 'failed' && d.errorMessage && (
                        <p className="text-[11px] text-rose-400/80 bg-rose-500/5 rounded-xl px-3 py-2 leading-relaxed break-words font-medium">
                          {d.errorMessage}
                        </p>
                      )}

                      {/* Progress bar */}
                      {isActive && (
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex-1">
                            <div
                              className={cn("h-full rounded-full transition-all duration-700", progressBg)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-white/40 font-medium">
                            {pct}%
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 3. Plex Activity Container */}
          {plexSessions.length > 0 && (
            <div className="rounded-[2rem] bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-md p-6 shadow-[var(--dk-shadow-glass)] shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e5a00d]" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Plex &middot; {plexSessions.length} streaming
                </span>
              </div>
              <PlexSessionList sessions={plexSessions} />
            </div>
          )}

          {/* 4. Empty/Placeholder State Container */}
          {!currentTrack && !hasDownloads && plexSessions.length === 0 && (
            <div className="rounded-[2rem] bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-md p-6 flex items-center justify-center shrink-0">
              <p className="text-sm text-muted-foreground/60 italic text-center">
                No current activity
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

