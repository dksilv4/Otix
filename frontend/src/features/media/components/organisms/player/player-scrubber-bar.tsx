import { useState, useMemo, useRef, useEffect, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/features/discover/utils/trailer'
import { generateWaveformBars } from '../../../utils/player'

export interface PlayerScrubberBarProps {
  progressBarRef?: RefObject<HTMLDivElement | null>
  effectiveDuration: number
  effectiveCurrentTime: number
  progressPercent: number
  bufferedPercent: number
  isDraggingProgress: boolean
  isPlaying?: boolean
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  barCount?: number
  className?: string
}

export const PlayerScrubberBar = ({
  progressBarRef,
  effectiveDuration,
  effectiveCurrentTime,
  progressPercent,
  bufferedPercent,
  isDraggingProgress: _isDraggingProgress,
  onMouseDown,
  barCount = 64,
  className,
}: PlayerScrubberBarProps) => {
  const fallbackRef = useRef<HTMLDivElement | null>(null)
  const activeRef = progressBarRef ?? fallbackRef
  const [hoverPercent, setHoverPercent] = useState<number | null>(null)
  const [dynamicBarCount, setDynamicBarCount] = useState<number>(barCount)

  // Dynamically compute optimal bar count based on container width so bars never overflow
  useEffect(() => {
    const el = activeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          // Pitch of ~5px per bar (bar width ~3px + gap ~2px)
          const computed = Math.max(24, Math.min(160, Math.floor(width / 5)))
          setDynamicBarCount(computed)
        }
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [activeRef])

  const effectiveBarCount = barCount !== 64 ? barCount : dynamicBarCount
  const bars = useMemo(() => generateWaveformBars(effectiveBarCount), [effectiveBarCount])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = activeRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    setHoverPercent(pct)
  }

  const handleMouseLeave = () => {
    setHoverPercent(null)
  }

  const hoverTimeSeconds =
    hoverPercent !== null && effectiveDuration > 0
      ? (hoverPercent / 100) * effectiveDuration
      : null

  const activeProgressRatio = progressPercent / 100
  const activeBufferedRatio = bufferedPercent / 100
  const activeHoverRatio = hoverPercent !== null ? hoverPercent / 100 : null

  return (
    <div
      ref={activeRef}
      role="slider"
      tabIndex={0}
      aria-label="Video timeline waveform scrubber"
      aria-valuemin={0}
      aria-valuemax={effectiveDuration || 100}
      aria-valuenow={effectiveCurrentTime}
      onMouseDown={onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative flex-1 min-w-0 h-7 sm:h-8 flex items-center cursor-pointer group pointer-events-auto select-none border-0 overflow-hidden',
        className,
      )}
    >
      {/* Waveform Bars Container */}
      <div className="relative w-full h-full flex items-center justify-between gap-[1.5px] sm:gap-[2px] px-0.5 overflow-hidden">
        {bars.map((bar, i) => {
          const isPlayed = bar.norm <= activeProgressRatio
          const isBuffered = bar.norm <= activeBufferedRatio
          const isHoverPreview =
            activeHoverRatio !== null &&
            !isPlayed &&
            bar.norm <= activeHoverRatio

          const heightPercent = Math.round(bar.baseHeightRatio * 100)

          return (
            <div
              key={i}
              className={cn(
                'flex-1 min-w-[1.5px] max-w-[3.5px] rounded-full transition-colors duration-150',
                isPlayed
                  ? 'bg-primary shadow-[0_0_8px_rgba(249,115,22,0.4)]'
                  : isHoverPreview
                  ? 'bg-foreground/50'
                  : isBuffered
                  ? 'bg-foreground/25'
                  : 'bg-foreground/10 group-hover:bg-foreground/20',
              )}
              style={{
                height: `${heightPercent}%`,
              }}
            />
          )
        })}
      </div>

      {/* Floating Hover Time Tooltip */}
      {hoverPercent !== null && hoverTimeSeconds !== null && (
        <div
          className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-white/[0.08] text-[10px] font-mono text-foreground pointer-events-none shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: `${Math.max(4, Math.min(96, hoverPercent))}%` }}
        >
          {formatTime(hoverTimeSeconds)}
        </div>
      )}
    </div>
  )
}
