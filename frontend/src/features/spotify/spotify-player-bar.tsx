import { useEffect, useRef, useState } from 'react'
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
import { useSpotifyPlayer } from './spotify-player-provider'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface ExtractedPalette {
  background: { r: number; g: number; b: number }
  surface: { r: number; g: number; b: number }
  accent: { r: number; g: number; b: number }
  accentText: string
}

type Rgb = { r: number; g: number; b: number }

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

function rgbCss(color: Rgb): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function rgbaCss(color: Rgb, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const toLinear = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function isHotRedHue(hue: number, saturation: number): boolean {
  return saturation > 45 && (hue <= 18 || hue >= 342)
}

function extractPalette(imageData: ImageData): ExtractedPalette {
  const pixels = imageData.data
  const colorBuckets: Array<Rgb & { count: number; sat: number; light: number }> = []

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (a < 128) continue

    const qr = Math.min(255, Math.round(r / 24) * 24)
    const qg = Math.min(255, Math.round(g / 24) * 24)
    const qb = Math.min(255, Math.round(b / 24) * 24)
    const [, sat, light] = rgbToHsl(r, g, b)

    const existing = colorBuckets.find(
      (c) => c.r === qr && c.g === qg && c.b === qb,
    )
    if (existing) {
      existing.count++
    } else {
      colorBuckets.push({ r: qr, g: qg, b: qb, count: 1, sat, light })
    }
  }

  if (colorBuckets.length === 0) {
    return DEFAULT_PALETTE
  }

  colorBuckets.sort((a, b) => b.count - a.count)
  const dominant = colorBuckets[0]
  const [dominantHue, dominantSat, dominantLight] = rgbToHsl(dominant.r, dominant.g, dominant.b)
  const dominantIsHotRed = isHotRedHue(dominantHue, dominantSat)
  const background = hslToRgb(
    dominantHue,
    Math.min(dominantIsHotRed ? 24 : 46, Math.max(12, dominantSat * (dominantIsHotRed ? 0.28 : 0.55))),
    Math.min(20, Math.max(8, dominantLight * 0.28)),
  )
  const surface = hslToRgb(
    dominantHue,
    Math.min(dominantIsHotRed ? 30 : 58, Math.max(14, dominantSat * (dominantIsHotRed ? 0.35 : 0.7))),
    Math.min(30, Math.max(14, dominantLight * 0.45)),
  )

  const accentSource = [...colorBuckets]
    .filter((color) => color.light >= 18 && color.light <= 86)
    .sort((a, b) => {
      const aDistinct = Math.min(1, colorDistance(a, background) / 160)
      const bDistinct = Math.min(1, colorDistance(b, background) / 160)
      const aLightScore = 1 - Math.abs(a.light - 55) / 55
      const bLightScore = 1 - Math.abs(b.light - 55) / 55
      const aHue = rgbToHsl(a.r, a.g, a.b)[0]
      const bHue = rgbToHsl(b.r, b.g, b.b)[0]
      const aRedPenalty = isHotRedHue(aHue, a.sat) ? 50 : 0
      const bRedPenalty = isHotRedHue(bHue, b.sat) ? 50 : 0
      const aScore = a.count * 0.35 + a.sat * 2.8 + aDistinct * 70 + aLightScore * 35 - aRedPenalty
      const bScore = b.count * 0.35 + b.sat * 2.8 + bDistinct * 70 + bLightScore * 35 - bRedPenalty
      return bScore - aScore
    })[0] ?? dominant
  const [accentHue, accentSat, accentLight] = rgbToHsl(accentSource.r, accentSource.g, accentSource.b)
  const accent = hslToRgb(
    accentHue,
    Math.min(88, Math.max(42, accentSat * 1.15)),
    Math.min(68, Math.max(42, accentLight)),
  )

  return {
    background,
    surface,
    accent,
    accentText: relativeLuminance(accent) > 0.48 ? '#111111' : '#ffffff',
  }
}

const DEFAULT_PALETTE: ExtractedPalette = {
  background: { r: 18, g: 19, b: 24 },
  surface: { r: 30, g: 32, b: 40 },
  accent: { r: 204, g: 190, b: 150 },
  accentText: '#111111',
}

interface DragState {
  x: number
  y: number
  width: number
  height: number
  offsetX: number
  offsetY: number
}

interface PersonListResponse {
  items: Array<{ id: string; name: string }>
}

// ── Shared player content (used by dropdown and floating bar) ──

export type QueuePlacement = 'above' | 'below'

export interface SpotifyPlayerContentProps {
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

export function SpotifyPlayerContent({
  showPinButton = false,
  showDragHandle = false,
  pinLabel = 'Pin player',
  onPin,
  onDismiss,
  queuePlacement = 'below',
  dragPointerHandlers,
  isDragging = false,
}: SpotifyPlayerContentProps) {
  const navigate = useNavigate()
  const {
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    nextTracks,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
  } = useSpotifyPlayer()

  const progress = duration > 0 ? position / duration : 0
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [dismissedTrackUri, setDismissedTrackUri] = useState<string | null>(null)
  const queueRef = useRef<HTMLDivElement>(null)
  const palette = usePalette(currentTrack?.albumArt ?? null)

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

  if (!currentTrack || dismissedTrackUri === currentTrack.uri) return null

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
  const artists = currentTrack?.artists.length
    ? currentTrack.artists
    : currentTrack?.artist
      .split(',')
      .map((name) => ({ name: name.trim(), uri: '' }))
      .filter((artist) => artist.name.length > 0) ?? []

  const handleArtistClick = async (artistName: string) => {
    const { data } = await apiClient.get<PersonListResponse>('/person/search', {
      params: { q: artistName, limit: 5 },
    })
    const person = data.items.find((item) => item.name.toLowerCase() === artistName.toLowerCase())
      ?? data.items[0]
    if (person) {
      navigate({ to: '/person/$personId', params: { personId: person.id } })
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
            {currentTrack.name}
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
            setDismissedTrackUri(currentTrack.uri)
            onDismiss?.()
          }}
          className="h-7 w-7 inline-flex items-center justify-center rounded-full text-white/35 hover:text-white/70 hover:bg-white/[0.08] transition-colors"
          title="Dismiss player"
        >
          <X className="h-3.5 w-3.5" />
        </button>

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
                'absolute right-0 w-56 rounded-xl border border-white/[0.08] backdrop-blur-md overflow-hidden',
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
      </div>
    </div>
  )
}

// ── Palette extraction hook ──

function usePalette(imageUrl: string | null) {
  const [palette, setPalette] = useState<ExtractedPalette>(DEFAULT_PALETTE)

  useEffect(() => {
    if (!imageUrl) {
      return
    }

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'

    img.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      try {
        ctx.drawImage(img, 0, 0, 64, 64)
        const imageData = ctx.getImageData(0, 0, 64, 64)
        const p = extractPalette(imageData)
        if (!cancelled) setPalette(p)
      } catch {
        if (!cancelled) setPalette(DEFAULT_PALETTE)
      }
    }

    img.onerror = () => {
      if (!cancelled) setPalette(DEFAULT_PALETTE)
    }

    img.src = imageUrl
    return () => { cancelled = true }
  }, [imageUrl])

  return imageUrl ? palette : DEFAULT_PALETTE
}

// ── Floating player position / drag ──

export type PlayerPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

const PLAYER_POSITION_STORAGE_KEY = 'otix_spotify_player_position_v2'

function loadPlayerPosition(): PlayerPosition {
  try {
    const raw = localStorage.getItem(PLAYER_POSITION_STORAGE_KEY)
    if (!raw) return 'bottom-center'
    const valid = [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ]
    return valid.includes(raw) ? raw as PlayerPosition : 'bottom-center'
  } catch {
    return 'bottom-center'
  }
}

export function savePlayerPosition(position: PlayerPosition) {
  try {
    localStorage.setItem(PLAYER_POSITION_STORAGE_KEY, position)
  } catch {
    // localStorage not available
  }
}

function canDragPlayer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches
}

const SNAP_POINTS: Record<PlayerPosition, { x: number; y: number }> = {
  'top-left': { x: 0, y: 0 },
  'top-center': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  'middle-left': { x: 0, y: 0.5 },
  'middle-right': { x: 1, y: 0.5 },
  'bottom-left': { x: 0, y: 1 },
  'bottom-center': { x: 0.5, y: 1 },
  'bottom-right': { x: 1, y: 1 },
}

function nearestSnapPosition(centerX: number, centerY: number, width: number, height: number): PlayerPosition {
  const margin = 16
  const maxX = window.innerWidth - width
  const maxY = window.innerHeight - height
  const normX = maxX > 0 ? (centerX - margin) / (maxX - margin) : 0.5
  const normY = maxY > 0 ? (centerY - margin) / (maxY - margin) : 0.5

  let best: PlayerPosition = 'bottom-center'
  let bestDist = Infinity
  for (const [pos, point] of Object.entries(SNAP_POINTS)) {
    const dx = normX - point.x
    const dy = normY - point.y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = pos as PlayerPosition
    }
  }
  return best
}

function positionToStyle(pos: PlayerPosition, width: number, _height: number): React.CSSProperties {
  const margin = 16
  const point = SNAP_POINTS[pos]

  const style: React.CSSProperties = {
    position: 'fixed',
    width: `${width}px`,
    margin: 0,
  }

  if (point.x === 0) {
    style.left = `${margin}px`
  } else if (point.x === 1) {
    style.right = `${margin}px`
  } else {
    style.left = '50%'
    style.transform = 'translateX(-50%)'
  }

  if (point.y === 0) {
    style.top = `${margin}px`
  } else if (point.y === 1) {
    style.bottom = `${margin}px`
  } else {
    style.top = '50%'
    style.transform = (style.transform ? `${style.transform} ` : '') + 'translateY(-50%)'
  }

  return style
}

// ── Floating player bar (pinned mode) ──

export function SpotifyPlayerBar({ onUnpin }: { onUnpin?: () => void }) {
  const { isReady, currentTrack } = useSpotifyPlayer()
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>(() => loadPlayerPosition())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)

  const isDraggingPlayer = dragState != null
  const dismissed = dismissedKey === currentTrack?.uri

  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handleResize = () => {
      if (!isDraggingPlayer) {
        forceUpdate((n) => n + 1)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isDraggingPlayer])

  // Reset dismissed state when track changes
  useEffect(() => {
    if (currentTrack?.uri && dismissedKey && dismissedKey !== currentTrack.uri) {
      setDismissedKey(null)
    }
  }, [currentTrack?.uri, dismissedKey])

  if (!isReady || !currentTrack || dismissed) return null

  const startPlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canDragPlayer() || e.button !== 0) return

    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragState({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    })
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const updatePlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return
    const margin = 16
    const maxX = Math.max(margin, window.innerWidth - dragState.width - margin)
    const maxY = Math.max(margin, window.innerHeight - dragState.height - margin)
    setDragState({
      ...dragState,
      x: Math.min(maxX, Math.max(margin, e.clientX - dragState.offsetX)),
      y: Math.min(maxY, Math.max(margin, e.clientY - dragState.offsetY)),
    })
  }

  const finishPlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return
    const centerX = dragState.x + dragState.width / 2
    const centerY = dragState.y + dragState.height / 2
    const snapPosition = nearestSnapPosition(centerX, centerY, dragState.width, dragState.height)
    setPlayerPosition(snapPosition)
    savePlayerPosition(snapPosition)
    setDragState(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const dragPointerHandlers = {
    onPointerDown: startPlayerDrag,
    onPointerMove: updatePlayerDrag,
    onPointerUp: finishPlayerDrag,
    onPointerCancel: finishPlayerDrag,
  }

  const containerStyle: React.CSSProperties = dragState
    ? {
        position: 'fixed',
        left: `${dragState.x}px`,
        top: `${dragState.y}px`,
        width: `${dragState.width}px`,
        zIndex: 50,
      }
    : {
        ...positionToStyle(playerPosition, 512, 0),
        zIndex: 50,
      }

  return (
    <div
      ref={playerRef}
      className="w-[calc(100%-16px)] max-w-lg select-none"
      style={containerStyle}
    >
      <SpotifyPlayerContent
        showDragHandle
        showPinButton={!!onUnpin}
        pinLabel="Unpin player"
        onPin={onUnpin}
        onDismiss={() => setDismissedKey(currentTrack?.uri ?? null)}
        queuePlacement="above"
        dragPointerHandlers={dragPointerHandlers}
        isDragging={isDraggingPlayer}
      />
    </div>
  )
}
