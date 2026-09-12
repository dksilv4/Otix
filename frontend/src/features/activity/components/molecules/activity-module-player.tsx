import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ListMusic, Pause, Play, SkipBack, SkipForward,
  Volume1, Volume2, VolumeX, ChevronLeft, Clock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayer } from '@/lib/player/use-player'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { apiClient } from '@/lib/api/client'
import { usePalette, rgbCss, rgbaCss } from '../../hooks/use-palette'
import { formatTime } from '@/lib/utils'

interface PersonListResponse {
  items: Array<{ id: string; name: string }>
}

interface QueueTrackView {
  uri?: string
  id?: string
  albumArt?: string
  name?: string
  title?: string
  artist?: string
}

function normalizeTrack(t: { id?: string; uri?: string; albumArt?: string | null; name?: string; title?: string; artist?: string }): QueueTrackView {
  const { albumArt, ...rest } = t
  return { ...rest, albumArt: albumArt ?? undefined }
}

/** Full-featured music player widget with album art, playback controls, progress, volume, and queue views. */
export function ActivityModulePlayer() {
  const navigate = useNavigate()
  const {
    source, isPlaying, currentTrack, position, duration, volume,
    togglePlay, skipNext, skipPrevious, seek, setVolume,
    plexQueue, plexPreviousTracks, skipPlexToIndex,
  } = usePlayer()

  const [showQueue, setShowQueue] = useState(false)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const queueContainerRef = useRef<HTMLDivElement>(null)
  const upNextContainerRef = useRef<HTMLDivElement>(null)

  const palette = usePalette(currentTrack?.albumArt ?? null)
  const backgroundColor = rgbaCss(palette.background, 0.92)
  const surfaceColor = rgbaCss(palette.surface, 0.88)
  const accentColor = rgbCss(palette.accent)

  const hasScrolledRef = useRef(false)

  const queueItems = plexQueue.slice(1).map(normalizeTrack)

  const prevItems = plexPreviousTracks
    .filter(item => {
      if (!currentTrack) return true
      const itemUri = 'uri' in item ? (item as { uri?: string }).uri : undefined
      const itemId = item.id
      if (itemId && itemId === currentTrack.id) return false
      if (itemUri && itemUri === currentTrack.uri) return false
      return true
    })
    .map(normalizeTrack)

  const progress = duration > 0 ? position / duration : 0
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const updateProgressFromEvent = useCallback((e: React.MouseEvent) => {
    const rect = progressBarRef.current?.getBoundingClientRect()
    if (!rect) return
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    seek(Math.floor(fraction * (duration || 0)))
  }, [duration, seek])

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

  const handleQueueItemClick = async (_item: { uri?: string; id?: string }, displayIndex: number) => {
    if (source === 'plex') {
      skipPlexToIndex(displayIndex + 1)
    }
  }

  const handlePrevItemClick = async (_item: { uri?: string; id?: string }, index: number) => {
    if (source === 'plex') {
      skipPlexToIndex(index)
    }
  }

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

  // Scroll queue container
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
  }, [prevItems.length, queueItems.length, currentTrack?.id, showQueue])

  const artists = currentTrack
    ? currentTrack.artists.length > 0
      ? currentTrack.artists
      : currentTrack.artist
        ? [{ name: currentTrack.artist, uri: '' }]
        : []
    : []

  if (!currentTrack) return null

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col shrink-0 backdrop-blur-md"
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
                      className={"w-full h-full object-cover rounded-2xl shadow-2xl" + (isPlaying ? " shadow-purple-500/10" : "")}
                    />
                  ) : (
                    <div className="w-full h-full rounded-2xl flex items-center justify-center bg-white/[0.04]">
                      <ListMusic className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5">
                    <span className="inline-flex items-center justify-center rounded-full p-1.5 bg-amber-400/20 text-amber-400">
                      <PlexIcon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Track info */}
              <div className="px-6 pb-3 shrink-0">
                <h2 className="text-lg font-semibold leading-tight truncate text-white/95">{currentTrack.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-white/55">
                  {artists.map((artist, i) => (
                    <span key={`${artist.uri || artist.name}-${i}`} className="inline-flex items-center">
                      {i > 0 && <span className="mr-1">,</span>}
                      <button
                        type="button"
                        onClick={() => handleArtistClick(artist.name)}
                        className="text-left truncate max-w-[180px] text-inherit transition-colors duration-fast ease hover:text-white/85"
                      >
                        {artist.name}
                      </button>
                    </span>
                  ))}
                </div>
                {currentTrack.albumName && (
                  <p className="mt-0.5 text-xs truncate text-white/40">{currentTrack.albumName}</p>
                )}
              </div>

              {/* Progress */}
              <div className="px-6 pb-2 shrink-0">
                <div
                  ref={progressBarRef}
                  className="relative h-1.5 w-full cursor-pointer group"
                  onMouseDown={handleProgressMouseDown}
                  onMouseMove={handleProgressMouseMove}
                  onMouseUp={handleProgressMouseUp}
                  onMouseLeave={() => setIsDraggingProgress(false)}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full transition-colors duration-fast ease"
                      style={{ width: `${progress * 100}%`, backgroundColor: accentColor }}
                    />
                  </div>
                  {(progress > 0.01 || isDraggingProgress) && (
                    <div
                      className={"absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full shadow-lg opacity-0 transition-opacity duration-fast ease group-hover:opacity-100" + (isDraggingProgress ? " opacity-100" : "")}
                      style={{ left: `${progress * 100}%`, backgroundColor: accentColor }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1 text-[11px] font-mono tabular-nums text-white/30">
                  <span>{formatTime(position)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls + Volume */}
              <div className={"relative flex items-center justify-center gap-3 px-6 shrink-0 pb-6" + (!(queueItems.length === 0 && prevItems.length === 0) ? " pb-4" : "")}>
                <button
                  type="button" onClick={skipPrevious}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full text-white/40 transition-colors duration-fast ease hover:text-white/80 hover:bg-white/[0.06]"
                  title="Previous"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                <button
                  type="button" onClick={togglePlay}
                  className="h-14 w-14 inline-flex items-center justify-center rounded-full transition-all duration-fast ease active:scale-95"
                  style={{ backgroundColor: accentColor, color: palette.accentText }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                </button>

                <button
                  type="button" onClick={skipNext}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-full text-white/40 transition-colors duration-fast ease hover:text-white/80 hover:bg-white/[0.06]"
                  title="Next"
                >
                  <SkipForward className="h-5 w-5" />
                </button>

                {/* Volume */}
                <div ref={volumeRef} className="absolute right-6">
                  <button
                    type="button"
                    onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-full text-white/35 transition-colors duration-fast ease hover:text-white/70 hover:bg-white/[0.06]"
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
                        className="absolute right-0 bottom-full mb-2 rounded-xl px-3 py-2.5 border border-white/[0.08] backdrop-blur-md shadow-xl"
                        style={{ background: `linear-gradient(135deg, ${rgbaCss(palette.background, 0.98)}, ${rgbaCss(palette.surface, 0.96)})` }}
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
                            <div className="h-full rounded-full" style={{ width: `${volume * 100}%`, backgroundColor: accentColor }} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Queue preview */}
              {!(queueItems.length === 0 && prevItems.length === 0) && (
                <QueueInline
                  queueItems={queueItems}
                  prevItems={prevItems}
                  queueContainerRef={queueContainerRef}
                  upNextContainerRef={upNextContainerRef}
                  onQueueItemClick={handleQueueItemClick}
                  onPrevItemClick={handlePrevItemClick}
                />
              )}
            </motion.div>
          ) : (
            <QueueFullView
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              queueItems={queueItems}
              prevItems={prevItems}
              palette={palette}
              accentColor={accentColor}
              onBack={() => setShowQueue(false)}
              onQueueItemClick={handleQueueItemClick}
              onPrevItemClick={handlePrevItemClick}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Queue toggle button */}
      {!(queueItems.length === 0 && prevItems.length === 0) && (
        <button
          type="button"
          onClick={() => setShowQueue(!showQueue)}
          className="px-6 pb-3 text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors cursor-pointer text-left"
        >
          {showQueue ? 'Show player' : 'Show queue'}
        </button>
      )}
    </div>
  )
}

/* ── Queue inline ── */

function QueueInline({
  queueItems, prevItems, queueContainerRef, upNextContainerRef,
  onQueueItemClick, onPrevItemClick,
}: {
  queueItems: Array<{ uri?: string; id?: string; albumArt?: string; name?: string; title?: string; artist?: string }>
  prevItems: Array<{ uri?: string; id?: string; albumArt?: string; name?: string; title?: string; artist?: string }>
  queueContainerRef: React.RefObject<HTMLDivElement | null>
  upNextContainerRef: React.RefObject<HTMLDivElement | null>
  onQueueItemClick: (item: { uri?: string; id?: string }, i: number) => void
  onPrevItemClick: (item: { uri?: string; id?: string }, i: number) => void
}) {
  return (
    <div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <ListMusic className="h-3.5 w-3.5 text-white/40" />
        <h3 className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Up next</h3>
        {queueItems.length > 0 && (
          <span className="text-[10px] ml-auto text-white/25">{queueItems.length}</span>
        )}
      </div>

      <div ref={queueContainerRef} className="relative overflow-y-auto flex-1 min-h-0 max-h-[160px]">
        {prevItems.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-1 pt-1">
              <Clock className="h-3 w-3 text-white/25" />
              <span className="text-white/25 text-[10px] font-medium uppercase tracking-wider">Previously played</span>
            </div>
            {prevItems.map((item, i) => (
              <button
                key={`prev-${item.id || (item as { uri?: string }).uri}-${i}`}
                type="button"
                onClick={() => onPrevItemClick(item, i)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors cursor-pointer text-inherit hover:bg-white/[0.03] opacity-50 hover:opacity-75"
              >
                {item.albumArt ? (
                  <img src={item.albumArt} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-7 w-7 rounded shrink-0 bg-white/[0.04]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate text-white/60">{'name' in item ? item.name : item.title}</p>
                  {'artist' in item && item.artist && (
                    <p className="text-[10px] truncate text-white/30">{item.artist}</p>
                  )}
                </div>
              </button>
            ))}
            <div className="my-1.5 border-t border-white/[0.04]" />
          </>
        )}

        <div ref={upNextContainerRef} className="space-y-0.5">
          {queueItems.map((item, i) => (
            <button
              key={`${item.id || (item as { uri?: string }).uri}-${i}`}
              type="button"
              onClick={() => onQueueItemClick(item, i)}
              className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors cursor-pointer text-left text-inherit hover:bg-white/[0.04] group"
            >
              {item.albumArt ? (
                <img src={item.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-md shrink-0 flex items-center justify-center bg-white/[0.04]">
                  <ListMusic className="h-4 w-4 text-white/10" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate text-white/80">{'name' in item ? item.name : item.title}</p>
                {'artist' in item && item.artist && (
                  <p className="text-[11px] truncate text-white/35">{item.artist}</p>
                )}
              </div>
              <Play className="h-3 w-3 opacity-0 transition-opacity shrink-0 text-white/15 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Queue full view ── */

function QueueFullView({
  currentTrack, isPlaying, queueItems, prevItems, palette, accentColor,
  onBack, onQueueItemClick, onPrevItemClick,
}: {
  currentTrack: NonNullable<ReturnType<typeof usePlayer>['currentTrack']>
  isPlaying: boolean
  queueItems: Array<{ uri?: string; id?: string; albumArt?: string; name?: string; title?: string; artist?: string }>
  prevItems: Array<{ uri?: string; id?: string; albumArt?: string; name?: string; title?: string; artist?: string }>
  palette: ReturnType<typeof usePalette>
  accentColor: string
  onBack: () => void
  onQueueItemClick: (item: { uri?: string; id?: string }, i: number) => void
  onPrevItemClick: (item: { uri?: string; id?: string }, i: number) => void
}) {
  return (
    <motion.div
      key="queue"
      initial={{ x: 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 60, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col flex-1"
    >
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          type="button" onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">Queue</span>
        <div className="w-[50px]" />
      </div>

      <div className="px-6 pb-4 shrink-0">
        <div
          className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
          style={{ backgroundColor: rgbaCss(palette.surface, 0.5), borderColor: rgbaCss(palette.accent, 0.15) }}
        >
          {currentTrack.albumArt ? (
            <img src={currentTrack.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-md shrink-0 bg-white/[0.04]" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-white/85">{currentTrack.title}</p>
            <p className="text-[11px] truncate text-white/40">{currentTrack.artist}</p>
          </div>
          <div className="ml-auto shrink-0 flex items-end gap-px h-3">
            {isPlaying ? (
              <>
                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_infinite]" style={{ height: '60%', backgroundColor: accentColor }} />
                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_0.15s_infinite]" style={{ height: '100%', backgroundColor: accentColor }} />
                <span className="w-0.5 rounded-full animate-[bounce_0.6s_ease-in-out_0.3s_infinite]" style={{ height: '40%', backgroundColor: accentColor }} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {prevItems.length > 0 && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2 mb-1 pt-1">
            <Clock className="h-3.5 w-3.5 text-white/25" />
            <h3 className="text-white/25 text-[10px] font-medium uppercase tracking-wider">Previously played</h3>
            <span className="text-[10px] ml-auto text-white/15">{prevItems.length}</span>
          </div>
          <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
            {prevItems.map((item, i) => (
              <button
                key={`prev-${item.id || (item as { uri?: string }).uri}-${i}`}
                type="button"
                onClick={() => onPrevItemClick(item, i)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors cursor-pointer text-inherit hover:bg-white/[0.03] opacity-50 hover:opacity-75"
              >
                {item.albumArt ? <img src={item.albumArt} alt="" className="h-7 w-7 rounded object-cover shrink-0" /> : <div className="h-7 w-7 rounded shrink-0 bg-white/[0.04]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate text-white/60">{'name' in item ? item.name : item.title}</p>
                  {'artist' in item && item.artist && <p className="text-[10px] truncate text-white/30">{item.artist}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <ListMusic className="h-3.5 w-3.5 text-white/40" />
          <h3 className="text-white/40 text-[11px] font-medium uppercase tracking-wider">Up next</h3>
          {queueItems.length > 0 && (
            <span className="text-[10px] ml-auto text-white/25">
              {queueItems.length} track{queueItems.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {queueItems.length === 0 ? (
          <p className="text-xs italic text-white/25">Queue is empty</p>
        ) : (
          <div className="space-y-0.5 overflow-y-auto flex-1 min-h-0 max-h-[220px]">
            {queueItems.map((item, i) => (
              <button
                key={`${item.id || (item as { uri?: string }).uri}-${i}`}
                type="button"
                onClick={() => onQueueItemClick(item, i)}
                className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors cursor-pointer text-left text-inherit hover:bg-white/[0.04] group"
              >
                {item.albumArt ? (
                  <img src={item.albumArt} alt="" className="h-9 w-9 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="h-9 w-9 rounded-md shrink-0 flex items-center justify-center bg-white/[0.04]">
                    <ListMusic className="h-4 w-4 text-white/10" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-white/80">{'name' in item ? item.name : item.title}</p>
                  {'artist' in item && item.artist && <p className="text-[11px] truncate text-white/35">{item.artist}</p>}
                </div>
                <Play className="h-3 w-3 opacity-0 transition-opacity shrink-0 text-white/15 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
