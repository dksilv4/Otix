import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
 ListMusic,
 Pause,
 Pin,
 Play,
 GripHorizontal,
 SkipBack,
 SkipForward,
 Volume1,
 Volume2,
 VolumeX,
 X,
} from 'lucide-react'
import { usePlayer } from './use-player'
import { usePalette, rgbCss, rgbaCss } from './use-palette'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'

function formatTime(ms: number): string {
 if (ms <= 0) return '0:00'
 const totalSec = Math.floor(ms / 1000)
 const m = Math.floor(totalSec / 60)
 const s = totalSec % 60
 return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Shared player content (used by dropdown and floating bar) ──

export type QueuePlacement = 'above' | 'below'

export interface PlayerBarContentProps {
 showPinButton?: boolean
 showDragHandle?: boolean
 pinLabel?: string
 onPin?: () => void
 onDismiss?: () => void
 queuePlacement?: QueuePlacement
 dragPointerHandlers?: {
 onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void
 onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void
 onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void
 onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void
 }
 isDragging?: boolean
}

interface PersonListResponse {
 items: Array<{ id: string; name: string }>
}

export function PlayerBarContent({
 showPinButton = false,
 showDragHandle = false,
 pinLabel = 'Pin player',
 onPin,
 onDismiss,
 queuePlacement = 'below',
 dragPointerHandlers,
 isDragging = false,
}: PlayerBarContentProps) {
 const navigate = useNavigate()
 const {
 source,
 isPlaying,
 currentTrack,
 position,
 duration,
 volume,
 spotifyNextTracks,
 plexQueue,
 togglePlay,
 skipNext,
 skipPrevious,
 seek,
 setVolume,
 } = usePlayer()

 const progress = duration > 0 ? position / duration : 0
 const [isDraggingProgress, setIsDraggingProgress] = useState(false)
 const [showQueue, setShowQueue] = useState(false)
 const [dismissedTrackId, setDismissedTrackId] = useState<string | null>(null)
 const queueRef = useRef<HTMLDivElement>(null)
 const palette = usePalette(currentTrack?.albumArt ?? null)

 // Unify queue display across Spotify and Plex sources.
 // Spotify's SDK provides nextTracks natively; for Plex we slice the queue
 // after the current track.
 const nextTracks = useMemo(() => {
 if (source === 'plex' && plexQueue.length > 0) {
 const currentIdx = currentTrack
 ? plexQueue.findIndex((t) => (t.ratingKey || t.id) === currentTrack.id)
 : -1
 const upcoming = currentIdx >= 0 ? plexQueue.slice(currentIdx + 1) : plexQueue
 return upcoming.map((t) => ({
 id: t.ratingKey || t.id,
 name: t.title,
 artist: t.artist,
 albumArt: t.albumArt,
 }))
 }
 return spotifyNextTracks
 }, [source, plexQueue, spotifyNextTracks, currentTrack])

 useEffect(() => {
 if (!showQueue) return
 const handleClick = (e: MouseEvent) => {
 if (queueRef.current && !queueRef.current.contains(e.target as Node)) {
 setShowQueue(false)
 }
 }
 document.addEventListener('mousedown', handleClick)
 return () => document.removeEventListener('mousedown', handleClick)
 }, [showQueue])

 if (!currentTrack || dismissedTrackId === currentTrack.id) return null

 const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
 const rect = e.currentTarget.getBoundingClientRect()
 const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
 seek(Math.floor(fraction * duration))
 }

 const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
 const accentColor = rgbCss(palette.accent)
 const backgroundColor = rgbaCss(palette.background, 0.78)
 const surfaceColor = rgbaCss(palette.surface, 0.62)
 const showProgressThumb = progress > 0.01 && progress < 0.99

 // Use the artists array primarily; fall back to single artist string (no comma-splitting)
 const artists = currentTrack.artists.length > 0
 ? currentTrack.artists
 : currentTrack.artist
 ? [{ name: currentTrack.artist, uri: '' }]
 : []

 const handleArtistClick = async (artistName: string) => {
 const { data } = await apiClient.get<PersonListResponse>('/person/search', {
 params: { q: artistName, limit: 5 },
 })
 const person = data.items.find((item) => item.name.toLowerCase() === artistName.toLowerCase())
 ?? data.items[0]
 if (person) {
 navigate({ to: '/person/$personId', params: { personId: person.id }, search: {} })
 }
 }

 return (
 <div
 className="relative rounded-2xl p-3 space-y-2"
 style={{
 background: `linear-gradient(135deg, ${backgroundColor} 0%, ${surfaceColor} 56%, ${rgbaCss(palette.accent, 0.22)} 100%)`,
 backdropFilter: 'blur(24px) saturate(145%)',
 WebkitBackdropFilter: 'blur(24px) saturate(145%)',
 }}
 >
 {/* Subtle noise texture overlay for depth */}
 <div
 className="absolute inset-0 opacity-[0.03] pointer-events-none"
 style={{
 backgroundImage:
 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)',
 backgroundSize: '4px 4px',
 }}
 />

 {/* Progress bar */}
 <div
 data-player-control
 className="relative h-1 w-full cursor-pointer group/progress"
 onClick={handleProgressClick}
 onMouseDown={() => setIsDraggingProgress(true)}
 onMouseUp={() => setIsDraggingProgress(false)}
 >
 <div className="absolute inset-0 overflow-hidden rounded-full bg-white/[0.12]">
 <div
 className="h-full rounded-full transition-colors"
 style={{
 width: `${progress * 100}%`,
 backgroundColor: accentColor,
 }}
 />
 </div>
 {showProgressThumb && (
 <div
 className={cn(
 'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
 'h-3 w-3 rounded-full',
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

 {/* Main row */}
 <div className="relative flex items-center gap-3">
 {currentTrack.albumArt ? (
 <img
 src={currentTrack.albumArt}
 alt={currentTrack.albumName}
 className="h-11 w-11 rounded-lg object-cover shrink-0 ring-1 ring-white/10"
 />
 ) : (
 <div className="h-11 w-11 rounded-lg bg-white/[0.06] shrink-0" />
 )}

 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium truncate leading-tight text-white/95">
 {currentTrack.title}
 </p>
 <div className="mt-0.5 flex max-w-full items-center overflow-hidden text-[11px] leading-tight text-white/55">
 {artists.map((artist, index) => (
 <span key={`${artist.uri || artist.name}-${index}`} className="inline-flex min-w-0 items-center">
 {index > 0 && <span className="shrink-0 pr-1">,</span>}
 <button
 type="button"
 onClick={() => handleArtistClick(artist.name)}
 className="truncate text-left transition-colors hover:text-white/85"
 title={`Open ${artist.name}`}
 >
 {artist.name}
 </button>
 </span>
 ))}
 </div>
 </div>

 <div className="hidden sm:flex items-center gap-1 text-[10px] tabular-nums text-white/35 shrink-0">
 <span>{formatTime(position)}</span>
 <span className="text-white/15">/</span>
 <span>{formatTime(duration)}</span>
 </div>

 <div className="flex items-center gap-0.5 shrink-0">
 <button
 type="button"
 onClick={skipPrevious}
 className="h-8 w-8 inline-flex items-center justify-center rounded-full text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
 title="Previous"
 >
 <SkipBack className="h-4 w-4" />
 </button>

 <button
 type="button"
 onClick={togglePlay}
 className="h-9 w-9 inline-flex items-center justify-center rounded-full transition-all active:scale-95"
 style={{
 backgroundColor: accentColor,
 color: palette.accentText,
 }}
 title={isPlaying ? 'Pause' : 'Play'}
 >
 {isPlaying ? (
 <Pause className="h-4 w-4" />
 ) : (
 <Play className="h-4 w-4 ml-0.5" />
 )}
 </button>

 <button
 type="button"
 onClick={skipNext}
 className="h-8 w-8 inline-flex items-center justify-center rounded-full text-white/50 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
 title="Next"
 >
 <SkipForward className="h-4 w-4" />
 </button>
 </div>
 </div>

 {/* Bottom row */}
 <div className="relative flex items-center gap-1.5">
 <div className="flex items-center gap-1 group/vol">
 <button
 type="button"
 onClick={() => setVolume(volume === 0 ? 0.5 : 0)}
 className="h-7 w-7 inline-flex items-center justify-center rounded-full text-white/35 hover:text-white/70 transition-colors"
 >
 <VolumeIcon className="h-3.5 w-3.5" />
 </button>
 <div data-player-control className="relative h-1 w-16 sm:w-20 cursor-pointer" title="Volume">
 <div
 className="absolute inset-0 rounded-full bg-white/[0.12]"
 onClick={(e) => {
 const rect = e.currentTarget.getBoundingClientRect()
 const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
 setVolume(fraction)
 }}
 >
 <div
 className="h-full rounded-full transition-colors"
 style={{
 width: `${volume * 100}%`,
 backgroundColor: accentColor,
 }}
 />
 </div>
 </div>
 </div>

 <div className="flex-1" />

 {showDragHandle && dragPointerHandlers && (
 <button
 type="button"
 {...dragPointerHandlers}
 className={cn(
 'hidden h-7 w-7 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/70 md:inline-flex',
 isDragging && 'cursor-grabbing text-white/70 bg-white/[0.08]',
 !isDragging && 'cursor-grab',
 )}
 title="Move player"
 aria-label="Move player"
 >
 <GripHorizontal className="h-3.5 w-3.5" />
 </button>
 )}

 {showPinButton && onPin && (
 <button
 type="button"
 onClick={onPin}
 className="h-7 w-7 inline-flex items-center justify-center rounded-full text-white/35 hover:text-white/70 hover:bg-white/[0.08] transition-colors"
 title={pinLabel}
 aria-label={pinLabel}
 >
 <Pin className="h-3.5 w-3.5" />
 </button>
 )}

 <button
 type="button"
 onClick={() => {
 setDismissedTrackId(currentTrack.id)
 onDismiss?.()
 }}
 className="h-7 w-7 inline-flex items-center justify-center rounded-full text-white/35 hover:text-white/70 hover:bg-white/[0.08] transition-colors"
 title="Dismiss player"
 >
 <X className="h-3.5 w-3.5" />
 </button>

 {/* Queue — only shown for Spotify source */}
 {source === 'spotify' && (
 <div className="relative">
 <button
 type="button"
 onClick={() => setShowQueue(!showQueue)}
 className={cn(
 'h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors',
 'text-white/35 hover:text-white/70 hover:bg-white/[0.08]',
 showQueue && 'text-white bg-white/15',
 )}
 title="Queue"
 >
 <ListMusic className="h-3.5 w-3.5" />
 </button>

 {showQueue && (
 <div
 data-player-control
 ref={queueRef}
 className={cn(
 'absolute right-0 w-56 rounded-xl backdrop-blur-md overflow-hidden',
 queuePlacement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
 )}
 style={{
 background: `linear-gradient(135deg, ${rgbaCss(palette.background, 0.98)}, ${rgbaCss(palette.surface, 0.96)})`,
 borderColor: rgbaCss(palette.accent, 0.22),
 }}
 >
 <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
 Up Next
 </div>
 {nextTracks.length === 0 ? (
 <p className="px-3 py-3 text-xs text-muted-foreground/60">
 Queue is empty
 </p>
 ) : (
 <div className="max-h-48 overflow-y-auto">
 {nextTracks.map((t, i) => (
 <div
 key={`${t.id}-${i}`}
 className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors"
 >
 {t.albumArt ? (
 <img
 src={t.albumArt}
 alt=""
 className="h-8 w-8 rounded object-cover shrink-0"
 />
 ) : (
 <div className="h-8 w-8 rounded bg-white/[0.06] shrink-0" />
 )}
 <div className="min-w-0">
 <p className="text-xs font-medium truncate">{t.name}</p>
 <p className="text-[10px] text-muted-foreground truncate">
 {t.artist}
 </p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 )
}
