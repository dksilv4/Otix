import { useState, useRef, useCallback, useEffect } from 'react'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import { formatVisualizerTime, getFrequencyHeatmapColor } from '../utils/visualizer-helpers'
import { cn } from '@/lib/utils'

export interface WaveformScrubberProps {
  positionMs: number
  durationMs: number
  isPlaying: boolean
  theme: MusicPlayerTheme
  onSeek: (ms: number) => void
  barCount?: number
  className?: string
}

export const WaveformScrubber = ({
  positionMs,
  durationMs,
  isPlaying,
  theme,
  onSeek,
  barCount = 84,
  className,
}: WaveformScrubberProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const posRef = useRef(positionMs)
  const durRef = useRef(durationMs)
  const playingRef = useRef(isPlaying)
  const themeRef = useRef(theme)
  const barCountRef = useRef(barCount)
  const prevHeightsRef = useRef<Float32Array>(new Float32Array(barCount))

  useEffect(() => {
    posRef.current = positionMs
    durRef.current = durationMs
    playingRef.current = isPlaying
    themeRef.current = theme
    barCountRef.current = barCount
    if (prevHeightsRef.current.length !== barCount) {
      prevHeightsRef.current = new Float32Array(barCount)
    }
  }, [positionMs, durationMs, isPlaying, theme, barCount])

  // High-performance 60fps/120fps direct hardware-accelerated Canvas render loop (Zero React re-renders)
  useEffect(() => {
    let animId: number

    const renderCanvas = () => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
          const rect = canvas.getBoundingClientRect()
          const width = rect.width
          const height = rect.height

          if (width > 0 && height > 0) {
            const pixelWidth = Math.round(width * dpr)
            const pixelHeight = Math.round(height * dpr)

            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
              canvas.width = pixelWidth
              canvas.height = pixelHeight
            }

            ctx.save()
            ctx.scale(dpr, dpr)
            ctx.clearRect(0, 0, width, height)

            const totalBars = barCountRef.current
            const currentDur = durRef.current
            const currentPos = posRef.current
            const progressRatio = currentDur > 0 ? Math.min(1, Math.max(0, currentPos / currentDur)) : 0
            const currentTheme = themeRef.current
            const isAudioPlaying = playingRef.current

            const frame = audioVisualizerEngine.getAudioFrame(currentPos, currentDur, isAudioPlaying)
            const freqData = frame.frequencyData

            const spacing = 1.4
            const totalSpacing = spacing * (totalBars - 1)
            const barWidth = Math.max(1.8, Math.min(3.2, (width - totalSpacing) / totalBars))
            const actualTotalWidth = totalBars * barWidth + totalSpacing
            const startX = Math.max(0, (width - actualTotalWidth) / 2)

            const prevHeights = prevHeightsRef.current

            for (let i = 0; i < totalBars; i++) {
              const norm = i / (totalBars - 1)
              const isPlayed = norm <= progressRatio

              // Acoustic harmonic contour + dynamic live audio frequency bounce
              const binIdx = Math.min(127, Math.floor(norm * 92))
              const freqVal = (freqData[binIdx] || 0) / 255
              const harmonic = Math.sin(i * 0.45) * 0.12 + Math.cos(i * 0.9) * 0.08
              const baseContour = 0.28 + Math.sin(norm * Math.PI) * 0.38 + harmonic
              const bounce = isAudioPlaying ? freqVal * 0.52 : 0
              const targetHeightPercent = Math.min(1.0, Math.max(0.18, baseContour + bounce))
              const targetH = targetHeightPercent * (height - 4)

              // Smooth 60fps lerp physics to eliminate any jitter
              const smoothH = prevHeights[i] * 0.62 + targetH * 0.38
              prevHeights[i] = smoothH

              const x = startX + i * (barWidth + spacing)
              const y = (height - smoothH) / 2
              const radius = Math.min(barWidth / 2, 1.5)

              // Cohesive single-accent bar coloring (zero multi-tone heatmap)
              if (currentTheme.hasArtwork) {
                ctx.fillStyle = isPlayed ? currentTheme.accentRgb : currentTheme.accentRgba(0.28)
              } else {
                ctx.fillStyle = isPlayed ? currentTheme.accentRgb : 'rgba(200, 200, 215, 0.35)'
              }

              ctx.beginPath()
              if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, y, barWidth, smoothH, radius)
              } else {
                ctx.rect(x, y, barWidth, smoothH)
              }
              ctx.fill()
            }

            ctx.restore()
          }
        }
      }
      animId = requestAnimationFrame(renderCanvas)
    }

    animId = requestAnimationFrame(renderCanvas)
    return () => {
      cancelAnimationFrame(animId)
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || durationMs <= 0) return

      setIsDragging(true)
      if (typeof containerRef.current?.setPointerCapture === 'function') {
        containerRef.current.setPointerCapture(e.pointerId)
      }

      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      onSeek(ratio * durationMs)
    },
    [durationMs, onSeek],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || durationMs <= 0) return

      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      setHoverX(e.clientX - rect.left)
      setHoverMs(ratio * durationMs)

      if (isDragging) {
        onSeek(ratio * durationMs)
      }
    },
    [durationMs, isDragging, onSeek],
  )

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (!isDragging) {
      setHoverX(null)
      setHoverMs(null)
    }
  }, [isDragging])

  return (
    <div className={cn('relative flex items-center gap-2.5 select-none min-w-[200px] flex-1', className)}>
      <span
        className="text-xs font-mono w-8 text-right shrink-0 transition-colors"
        style={{ color: theme.subtextColor }}
      >
        {formatVisualizerTime(positionMs)}
      </span>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className="relative flex-1 h-9 flex items-center cursor-pointer group py-0.5"
        role="slider"
        aria-label="Audio scrubber"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={positionMs}
      >
        {/* Floating Hover Timestamp Tooltip */}
        {hoverX !== null && hoverMs !== null && (
          <div
            className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-overlay)] text-foreground text-xs font-mono shadow-md pointer-events-none z-30"
            style={{ left: hoverX }}
          >
            {formatVisualizerTime(hoverMs)}
          </div>
        )}

        {/* 60fps Hardware-Accelerated 2D Canvas Waveform */}
        <canvas
          ref={canvasRef}
          className="w-full h-full block pointer-events-none"
        />
      </div>

      <span
        className="text-xs font-mono w-8 shrink-0 transition-colors"
        style={{ color: theme.subtextColor }}
      >
        {formatVisualizerTime(durationMs)}
      </span>
    </div>
  )
}
