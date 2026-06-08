// TODO: Review this file
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
  Disc,
  Download,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Gamepad2,
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
import { useInstallProgress } from '@/features/game-scanner/install-store'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop-api'
import { useRunningGame } from '@/features/games/hooks/use-running-game'
import './now-playing-view.scss'

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

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface PersonListResponse {
  items: Array<{ id: string; name: string }>
}

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

// ── Now Playing View ──

const PANEL_WIDTH = 300
const PANEL_MARGIN = 16

export interface NowPlayingViewProps {
  open: boolean
  onClose: () => void
}

export function NowPlayingView({ open, onClose }: NowPlayingViewProps) {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { installs, dismissInstall, cancelInstall } = useInstallProgress()
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

  const { runningGame, elapsedMs } = useRunningGame()
  const desktop = isDesktop()

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
      const { data } = await apiClient.get<PlexSessionsResponse>('/integrations/plex/sessions')
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

  const staggerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  }

  const sectionVariants = {
    hidden: { opacity: 0, y: -16, scale: 0.97, filter: 'blur(4px)' },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
    exit: {
      opacity: 0,
      y: -12,
      scale: 0.97,
      filter: 'blur(2px)',
      transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
    },
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
          className="dk-now-playing__panel"
          style={{
            width: PANEL_WIDTH,
            right: PANEL_MARGIN,
            top: desktop ? 100 : 60,
            maxHeight: `calc(100vh - 100px - ${PANEL_MARGIN}px)`,
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
          {/* ── Stagger container for section animations ── */}
          <motion.div
            variants={staggerVariants}
            initial="hidden"
            animate="visible"
            className="dk-now-playing__sections"
          >
            {/* 0. Game Activity — running game detected by GameDetector */}
            <AnimatePresence mode="popLayout">
              {runningGame && (
                <motion.div
                  key="section-game"
                  variants={sectionVariants}
                  exit="exit"
                  layout
                >
                  <div className="dk-now-playing__game">
                    <div className="dk-now-playing__game-card">
                      <div className="dk-now-playing__game-art">
                        {runningGame.game.posterUrl || runningGame.game.iconUrl ? (
                          <img
                            src={runningGame.game.posterUrl || runningGame.game.iconUrl}
                            alt={runningGame.game.title}
                            className="dk-now-playing__game-img"
                          />
                        ) : (
                          <div className="dk-now-playing__game-img-placeholder">
                            <Gamepad2 size={24} className="text-white/30" />
                          </div>
                        )}
                        <div className="dk-now-playing__game-badge">
                          <span className="dk-now-playing__game-badge-dot" />
                        </div>
                      </div>
                      <div className="dk-now-playing__game-info">
                        <p className="dk-now-playing__game-label">Now Playing</p>
                        <h3 className="dk-now-playing__game-title">{runningGame.game.data?.title || runningGame.game.title}</h3>
                        <div className="dk-now-playing__game-meta">
                          <span className="dk-now-playing__game-platform">{runningGame.game.platform.toUpperCase()}</span>
                          <span className="dk-now-playing__game-sep">·</span>
                          <span className="dk-now-playing__game-timer">
                            <Clock size={10} />
                            {formatElapsed(elapsedMs)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 1. Music Player Container */}
          {currentTrack && (
            <div
              className="dk-now-playing__player"
              style={{
                background: `linear-gradient(160deg, ${backgroundColor} 0%, ${surfaceColor} 56%, ${rgbaCss(palette.accent, 0.18)} 100%)`,
                transition: 'background 1s ease',
              }}
            >
              <div ref={scrollRef} className="dk-now-playing__player-inner">
                <AnimatePresence mode="wait">
                  {!showQueue ? (
                    <motion.div
                      key="main"
                      initial={{ x: -60, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -60, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="dk-now-playing__main-view"
                    >
                      {/* Album art */}
                      <div className="dk-now-playing__album">
                        <div className="dk-now-playing__album-inner">
                          {currentTrack.albumArt ? (
                            <img
                              src={currentTrack.albumArt}
                              alt={currentTrack.albumName}
                              className={cn(
                                'dk-now-playing__album-img',
                                isPlaying && 'dk-now-playing__album-img--playing',
                              )}
                            />
                          ) : (
                            <div className="dk-now-playing__album-placeholder">
                              <ListMusic className="h-12 w-12 text-muted-foreground/30" />
                            </div>
                          )}
                          {/* Source badge */}
                          <div className="dk-now-playing__badge">
                            <span
                              className={cn(
                                'dk-now-playing__badge-chip',
                                source === 'spotify'
                                  ? 'dk-now-playing__badge-chip--spotify'
                                  : 'dk-now-playing__badge-chip--plex',
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
                      <div className="dk-now-playing__track-info">
                        <h2 className="dk-now-playing__track-title">
                          {currentTrack.title}
                        </h2>
                        <div className="dk-now-playing__track-artists">
                          {artists.map((artist, i) => (
                            <span key={`${artist.uri || artist.name}-${i}`} className="inline-flex items-center">
                              {i > 0 && <span className="mr-1">,</span>}
                              <button
                                type="button"
                                onClick={() => handleArtistClick(artist.name)}
                                className="dk-now-playing__artist-btn"
                              >
                                {artist.name}
                              </button>
                            </span>
                          ))}
                        </div>
                        {currentTrack.albumName && (
                          <p className="dk-now-playing__album-label">
                            {currentTrack.albumName}
                          </p>
                        )}
                      </div>

                      {/* Progress */}
                      <div className="dk-now-playing__progress">
                        <div
                          ref={progressBarRef}
                          className="dk-now-playing__progress-bar"
                          onMouseDown={handleProgressMouseDown}
                          onMouseMove={handleProgressMouseMove}
                          onMouseUp={handleProgressMouseUp}
                          onMouseLeave={() => setIsDraggingProgress(false)}
                        >
                          <div className="dk-now-playing__progress-track">
                            <div
                              className="dk-now-playing__progress-fill"
                              style={{
                                width: `${progress * 100}%`,
                                backgroundColor: accentColor,
                              }}
                            />
                          </div>
                          {(progress > 0.01 || isDraggingProgress) && (
                            <div
                              className={cn(
                                'dk-now-playing__progress-thumb',
                                isDraggingProgress && 'dk-now-playing__progress-thumb--visible',
                              )}
                              style={{
                                left: `${progress * 100}%`,
                                backgroundColor: accentColor,
                              }}
                            />
                          )}
                        </div>
                        <div className="dk-now-playing__progress-time">
                          <span>{formatTime(position)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Controls + Volume */}
                      <div className={cn(
                        'dk-now-playing__controls',
                        !(queueItems.length === 0 && prevItems.length === 0) && 'dk-now-playing__controls--compact',
                      )}>
                        <button
                          type="button"
                          onClick={skipPrevious}
                          className="dk-now-playing__ctrl-btn"
                          title="Previous"
                        >
                          <SkipBack className="h-5 w-5" />
                        </button>

                        <button
                          type="button"
                          onClick={togglePlay}
                          className="dk-now-playing__play-btn"
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
                          className="dk-now-playing__ctrl-btn"
                          title="Next"
                        >
                          <SkipForward className="h-5 w-5" />
                        </button>

                        {/* Volume — icon only, click shows slider */}
                        <div ref={volumeRef} className="dk-now-playing__volume">
                          <button
                            type="button"
                            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                            className="dk-now-playing__volume-btn"
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
                                className="dk-now-playing__volume-popup"
                                style={{
                                  background: `linear-gradient(135deg, ${rgbaCss(palette.background, 0.98)}, ${rgbaCss(palette.surface, 0.96)})`,
                                }}
                              >
                                <div className="dk-now-playing__volume-slider" title="Volume">
                                  <div
                                    className="dk-now-playing__volume-track"
                                    onClick={(e) => {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                                      setVolume(fraction)
                                    }}
                                  >
                                    <div
                                      className="dk-now-playing__volume-fill"
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
                        <div className="dk-now-playing__queue-inline">
                          <div className="dk-now-playing__queue-inline-header">
                            <ListMusic className="h-3.5 w-3.5 text-white/40" />
                            <h3 className="dk-now-playing__queue-section-label--normal dk-now-playing__queue-header-label">
                              Up next
                            </h3>
                            {queueItems.length > 0 && (
                              <span className="dk-now-playing__queue-count text-white/25">
                                {queueItems.length}
                              </span>
                            )}
                          </div>

                          <div ref={queueContainerRef} className="dk-now-playing__queue-inline-list">
                            {/* Previously played */}
                            {prevItems.length > 0 && (
                              <>
                                <div className="dk-now-playing__queue-section-header">
                                  <Clock className="h-3 w-3 text-white/25" />
                                  <span className="dk-now-playing__queue-section-label--subtle dk-now-playing__queue-section-label">
                                    Previously played
                                  </span>
                                </div>
                                {prevItems.map((item, i) => (
                                  <button
                                    key={`prev-${item.id || (item as any).uri}-${i}`}
                                    type="button"
                                    onClick={() => handlePrevItemClick(item)}
                                    className="dk-now-playing__queue-item dk-now-playing__queue-item--prev"
                                  >
                                    {item.albumArt ? (
                                      <img src={item.albumArt} alt="" className="dk-now-playing__queue-item-img" />
                                    ) : (
                                      <div className="dk-now-playing__queue-item-placeholder" />
                                    )}
                                    <div className="dk-now-playing__queue-item-info">
                                      <p className="dk-now-playing__queue-item-title">{'name' in item ? item.name : item.title}</p>
                                      {'artist' in item && item.artist && (
                                        <p className="dk-now-playing__queue-item-artist">{item.artist}</p>
                                      )}
                                    </div>
                                  </button>
                                ))}
                                <div className="dk-now-playing__queue-divider" />
                              </>
                            )}

                            {/* Up next */}
                            <div ref={upNextContainerRef} className="dk-now-playing__queue-inline-items">
                              {queueItems.map((item, i) => (
                                <button
                                  key={`${item.id || (item as any).uri}-${i}`}
                                  type="button"
                                  onClick={() => handleQueueItemClick(item, i)}
                                  className="dk-now-playing__queue-item--up-next"
                                >
                                  {item.albumArt ? (
                                    <img src={item.albumArt} alt="" className="dk-now-playing__queue-item-img--lg" />
                                  ) : (
                                    <div className="dk-now-playing__queue-item-placeholder--lg">
                                      <ListMusic className="h-4 w-4 text-white/10" />
                                    </div>
                                  )}
                                  <div className="dk-now-playing__queue-item-info">
                                    <p className="dk-now-playing__queue-item-title--lg">{'name' in item ? item.name : item.title}</p>
                                    {'artist' in item && item.artist && (
                                      <p className="dk-now-playing__queue-item-artist--lg">{item.artist}</p>
                                    )}
                                  </div>
                                  <Play className="dk-now-playing__queue-item-play-icon" />
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
                      className="dk-now-playing__queue-view"
                    >
                      {/* Queue header — back button only */}
                      <div className="dk-now-playing__queue-view-header">
                        <button
                          type="button"
                          onClick={() => setShowQueue(false)}
                          className="dk-now-playing__queue-view-back"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Back
                        </button>
                        <span className="dk-now-playing__queue-view-title">
                          Queue
                        </span>
                        <div className="dk-now-playing__queue-view-spacer" />
                      </div>

                      {/* Now playing indicator */}
                      <div className="dk-now-playing__now-playing-section">
                        <div
                          className="dk-now-playing__now-playing-card"
                          style={{
                            backgroundColor: rgbaCss(palette.surface, 0.5),
                            borderColor: rgbaCss(palette.accent, 0.15),
                          }}
                        >
                          {currentTrack.albumArt ? (
                            <img src={currentTrack.albumArt} alt="" className="dk-now-playing__now-playing-card-img" />
                          ) : (
                            <div className="dk-now-playing__now-playing-card-placeholder" />
                          )}
                          <div className="dk-now-playing__now-playing-card-info">
                            <p className="dk-now-playing__now-playing-card-title">{currentTrack.title}</p>
                            <p className="dk-now-playing__now-playing-card-artist">{currentTrack.artist}</p>
                          </div>
                          <div className="dk-now-playing__now-playing-card-eq">
                            {isPlaying ? (
                              <>
                                <span className="dk-now-playing__now-playing-card-eq-bar animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%', backgroundColor: accentColor }} />
                                <span className="dk-now-playing__now-playing-card-eq-bar animate-[bounce_0.6s_ease-in-out_0.15s_infinite]" style={{ height: '100%', backgroundColor: accentColor }} />
                                <span className="dk-now-playing__now-playing-card-eq-bar animate-[bounce_0.6s_ease-in-out_0.3s_infinite]" style={{ height: '40%', backgroundColor: accentColor }} />
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Previously played */}
                      {prevItems.length > 0 && (
                        <div className="dk-now-playing__queue-prev">
                          <div className="dk-now-playing__queue-section-header">
                            <Clock className="h-3.5 w-3.5 text-white/25" />
                            <h3 className="dk-now-playing__queue-section-label--subtle dk-now-playing__queue-section-label">
                              Previously played
                            </h3>
                            <span className="dk-now-playing__queue-count text-white/15">{prevItems.length}</span>
                          </div>
                          <div className="dk-now-playing__queue-prev-list">
                            {prevItems.map((item, i) => (
                              <button
                                key={`prev-${item.id || (item as any).uri}-${i}`}
                                type="button"
                                onClick={() => handlePrevItemClick(item)}
                                className="dk-now-playing__queue-item dk-now-playing__queue-item--prev"
                              >
                                {item.albumArt ? (
                                  <img src={item.albumArt} alt="" className="dk-now-playing__queue-item-img" />
                                ) : (
                                  <div className="dk-now-playing__queue-item-placeholder" />
                                )}
                                <div className="dk-now-playing__queue-item-info">
                                  <p className="dk-now-playing__queue-item-title">{'name' in item ? item.name : item.title}</p>
                                  {'artist' in item && item.artist && (
                                    <p className="dk-now-playing__queue-item-artist">{item.artist}</p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Up next — full list */}
                      <div className="dk-now-playing__queue-upnext">
                        <div className="dk-now-playing__queue-upnext-header">
                          <ListMusic className="h-3.5 w-3.5 text-white/40" />
                          <h3 className="dk-now-playing__queue-section-label--normal dk-now-playing__queue-header-label">
                            Up next
                          </h3>
                          {queueItems.length > 0 && (
                            <span className="dk-now-playing__queue-count text-white/25">
                              {queueItems.length} track{queueItems.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {queueItems.length === 0 ? (
                          <p className="dk-now-playing__queue-empty">Queue is empty</p>
                        ) : (
                          <div className="dk-now-playing__queue-upnext-list">
                            {queueItems.map((item, i) => (
                              <button
                                key={`${item.id || (item as any).uri}-${i}`}
                                type="button"
                                onClick={() => handleQueueItemClick(item, i)}
                                className="dk-now-playing__queue-item--up-next"
                              >
                                {item.albumArt ? (
                                  <img src={item.albumArt} alt="" className="dk-now-playing__queue-item-img--lg" />
                                ) : (
                                  <div className="dk-now-playing__queue-item-placeholder--lg">
                                    <ListMusic className="h-4 w-4 text-white/10" />
                                  </div>
                                )}
                                <div className="dk-now-playing__queue-item-info">
                                  <p className="dk-now-playing__queue-item-title--lg">{'name' in item ? item.name : item.title}</p>
                                  {'artist' in item && item.artist && (
                                    <p className="dk-now-playing__queue-item-artist--lg">{item.artist}</p>
                                  )}
                                </div>
                                <Play className="dk-now-playing__queue-item-play-icon" />
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

          {/* 2. Game Install Progress */}
          <AnimatePresence mode="popLayout">
            {installs.length > 0 && (
              <motion.div
                key="section-installs"
                variants={sectionVariants}
                exit="exit"
                layout
              >
            <div className="dk-now-playing__downloads">
              <div className="dk-now-playing__downloads-header">
                <div className="dk-now-playing__downloads-icon-wrap">
                  {installs.some(i => i.active) ? (
                    <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                </div>
                <span className="dk-now-playing__downloads-title">
                  Game Installs ({installs.length})
                </span>
              </div>
              <div className="dk-now-playing__downloads-list">
                {installs.map((inst) => (
                  <div key={inst.isoPath} className="dk-now-playing__downloads-item">
                    <div className="dk-now-playing__downloads-item-top">
                      {inst.active ? (
                        <Loader2 className="h-4 w-4 text-emerald-400 animate-spin shrink-0" />
                      ) : inst.result?.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                      )}
                      <div className="dk-now-playing__queue-item-info">
                        <p className="dk-now-playing__downloads-item-name" title={inst.gameTitle ?? ''}>
                          {inst.gameTitle ?? 'Game'}
                        </p>
                      </div>
                      <div className="dk-now-playing__downloads-actions">
                        {inst.active ? (
                          <button
                            type="button"
                            onClick={() => cancelInstall(inst.isoPath)}
                            className="dk-now-playing__downloads-cancel"
                            title="Cancel Install"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => dismissInstall(inst.isoPath)}
                            className="dk-now-playing__downloads-cancel"
                            title="Dismiss"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {inst.active && inst.progress && (
                      <div className="dk-now-playing__downloads-progress">
                        <div className="dk-now-playing__downloads-progress-track">
                          <div
                            className="dk-now-playing__downloads-progress-fill dk-now-playing__downloads-progress-fill--downloading"
                            style={{ width: `${inst.progress.progress}%` }}
                          />
                        </div>
                        <span className="dk-now-playing__downloads-progress-pct">
                          {inst.progress.progress}%
                        </span>
                      </div>
                    )}

                    {/* Phase message */}
                    {inst.active && inst.progress && (
                      <p className="dk-now-playing__downloads-error" style={{ marginTop: 4 }}>
                        {inst.progress.message || inst.progress.phase}
                      </p>
                    )}

                    {/* Error message */}
                    {inst.error && !inst.active && (
                      <p className="dk-now-playing__downloads-error" style={{ marginTop: 4 }}>
                        {inst.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3. Downloads Container */}
          <AnimatePresence mode="popLayout">
            {hasDownloads && (
              <motion.div
                key="section-downloads"
                variants={sectionVariants}
                exit="exit"
                layout
              >
            <div className="dk-now-playing__downloads">
              <div className="dk-now-playing__downloads-header">
                <div className="dk-now-playing__downloads-icon-wrap">
                  <Download className="h-4 w-4 text-blue-400" />
                  {activeAndRecentDownloads.some(d => d.status === 'downloading') && (
                    <span className="dk-now-playing__ping">
                      <span className="dk-now-playing__ping-ring"></span>
                      <span className="dk-now-playing__ping-dot"></span>
                    </span>
                  )}
                </div>
                <span className="dk-now-playing__downloads-title">
                  Downloads
                </span>
              </div>
              <div className="dk-now-playing__downloads-list">
                {activeAndRecentDownloads.map(d => {
                  const isActive = d.status === 'queued' || d.status === 'downloading' || d.status === 'processing'
                  const pct = d.percentage ?? 0

                  // Status config details (strictly colors)
                  let statusIcon = <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                  let progressBgClass = 'dk-now-playing__downloads-progress-fill--queued'

                  if (d.status === 'downloading') {
                    statusIcon = <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                    progressBgClass = 'dk-now-playing__downloads-progress-fill--downloading'
                  } else if (d.status === 'processing') {
                    statusIcon = <RefreshCw className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
                    progressBgClass = 'dk-now-playing__downloads-progress-fill--processing'
                  } else if (d.status === 'completed') {
                    statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    progressBgClass = 'dk-now-playing__downloads-progress-fill--completed'
                  } else if (d.status === 'failed') {
                    statusIcon = <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    progressBgClass = 'dk-now-playing__downloads-progress-fill--failed'
                  }

                  return (
                    <div
                      key={d.id}
                      className="dk-now-playing__downloads-item"
                    >
                      <div className="dk-now-playing__downloads-item-top">
                        {statusIcon}
                        <div className="dk-now-playing__queue-item-info">
                          <p className="dk-now-playing__downloads-item-name" title={d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}>
                            {d.mediaItemTitle ?? d.nzbName ?? 'Unknown'}
                          </p>
                          {d.nzbSize ? (
                            <p className="dk-now-playing__downloads-item-size">
                              {formatBytes(d.nzbSize)}
                            </p>
                          ) : null}
                        </div>

                        {/* Action buttons (only cancel button on active downloads) */}
                        {isActive && (
                          <div className="dk-now-playing__downloads-actions">
                            <button
                              type="button"
                              onClick={() => cancelDownload(d.id)}
                              className="dk-now-playing__downloads-cancel"
                              title="Cancel Download"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Error details */}
                      {d.status === 'failed' && d.errorMessage && (
                        <p className="dk-now-playing__downloads-error">
                          {d.errorMessage}
                        </p>
                      )}

                      {/* Progress bar */}
                      {isActive && (
                        <div className="dk-now-playing__downloads-progress">
                          <div className="dk-now-playing__downloads-progress-track">
                            <div
                              className={cn('dk-now-playing__downloads-progress-fill', progressBgClass)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="dk-now-playing__downloads-progress-pct">
                            {pct}%
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4. Plex Activity Container */}
          <AnimatePresence mode="popLayout">
            {plexSessions.length > 0 && (
              <motion.div
                key="section-plex"
                variants={sectionVariants}
                exit="exit"
                layout
              >
                <div className="dk-now-playing__plex">
                  <div className="dk-now-playing__plex-header">
                    <span className="dk-now-playing__plex-dot" />
                    <span className="dk-now-playing__plex-title">
                      Plex &middot; {plexSessions.length} streaming
                    </span>
                  </div>
                  <PlexSessionList sessions={plexSessions} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 5. Empty/Placeholder State Container */}
          <AnimatePresence mode="popLayout">
            {!currentTrack && !hasDownloads && installs.length === 0 && plexSessions.length === 0 && !runningGame && (
              <motion.div
                key="section-empty"
                variants={sectionVariants}
                exit="exit"
              >
                <div className="dk-now-playing__empty">
                  <p className="dk-now-playing__empty-text">
                    No current activity
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
