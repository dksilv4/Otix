import { useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Maximize2,
  X,
  PictureInPicture2,
  Volume2,
  VolumeX,
  Loader2,
  GripHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSeconds, calculateProgressFromEvent } from '../../utils/player'

export interface MediaPlayerInAppPipOverlayProps {
  title: string
  source: string
  isPlaying: boolean
  isBuffering: boolean
  isOverallPip: boolean
  isDragging?: boolean
  currentTime: number
  duration: number
  isMuted: boolean
  controlsVisible: boolean
  onTogglePlay: () => void
  onSkipBack: () => void
  onSkipForward: () => void
  onSeek: (seconds: number) => void
  onToggleMute: () => void
  onRestore: () => void
  onToggleOverallPip: () => void
  onClose: () => void
}

export const MediaPlayerInAppPipOverlay = ({
  title,
  source,
  isPlaying,
  isBuffering,
  isOverallPip,
  isDragging = false,
  currentTime,
  duration,
  isMuted,
  controlsVisible,
  onTogglePlay,
  onSkipBack,
  onSkipForward,
  onSeek,
  onToggleMute,
  onRestore,
  onToggleOverallPip,
  onClose,
}: MediaPlayerInAppPipOverlayProps) => {
  const progressBarRef = useRef<HTMLDivElement>(null)

  const handleScrubberClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      const newTime = calculateProgressFromEvent(e.clientX, progressBarRef.current, duration)
      onSeek(newTime)
    },
    [duration, onSeek],
  )

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  if (isOverallPip) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-3 text-center bg-[var(--dk-surface-base)]/90 backdrop-blur-xl">
        <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2 shadow-md">
          <PictureInPicture2 className="h-5 w-5 animate-pulse" />
        </div>
        <p className="text-xs font-bold text-foreground truncate max-w-[90%] mb-0.5">{title}</p>
        <span className="text-[10px] text-muted-foreground mb-3">Playing in OS PiP window</span>

        <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onToggleOverallPip}
            className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-semibold text-[11px] hover:brightness-110 active:scale-95 transition-all shadow-sm"
            title="Restore video to player"
          >
            Return Video
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="p-1.5 rounded-full bg-[var(--dk-surface-glass)] text-foreground hover:bg-[var(--dk-surface-ghost-hover)] active:scale-95 transition-all"
            title="Expand to full player (I)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-[var(--dk-surface-glass)] text-foreground hover:bg-[var(--dk-surface-ghost-hover)] active:scale-95 transition-all"
            title="Close stream"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Top Centered Drag Handle Grip */}
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-none z-40 transition-all duration-200">
        <div
          className={cn(
            'h-1 rounded-full transition-all duration-200',
            isDragging
              ? 'w-12 bg-primary shadow-sm'
              : 'w-7 bg-foreground/30 group-hover/pip:bg-foreground/50 group-hover/pip:w-9',
          )}
        />
      </div>

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
          <div className="p-2.5 rounded-2xl bg-[var(--dk-surface-base)]/80 border border-white/[0.06] shadow-xl flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Buffering</span>
          </div>
        </div>
      )}

      {/* Overlay Controls */}
      <div
        className={cn(
          'absolute inset-0 z-30 flex flex-col justify-between p-2.5 transition-opacity duration-200 pointer-events-none bg-gradient-to-t from-black/85 via-black/25 to-black/75',
          isDragging ? 'opacity-0' : controlsVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 pointer-events-auto pt-1 select-none">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[65%] cursor-grab active:cursor-grabbing">
            <GripHorizontal className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span className="text-xs font-bold text-foreground truncate drop-shadow-sm">{title}</span>
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 shrink-0">
              {source}
            </span>
          </div>

          <div
            className="flex items-center gap-1 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onRestore}
              className="h-6 w-6 rounded-lg bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground flex items-center justify-center transition-all active:scale-90 border border-white/[0.04]"
              title="Expand to full player (I)"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onToggleOverallPip}
              className="h-6 w-6 rounded-lg bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground flex items-center justify-center transition-all active:scale-90 border border-white/[0.04]"
              title="Picture-in-Picture (OS window) (P)"
            >
              <PictureInPicture2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-6 w-6 rounded-lg bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground flex items-center justify-center transition-all active:scale-90 border border-white/[0.04]"
              title="Close player"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Center Quick Transport */}
        <div
          className="flex items-center justify-center gap-3 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onSkipBack}
            className="p-1.5 rounded-full bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground active:scale-90 transition-all border border-white/[0.04]"
            title="Skip back 10s"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onSkipForward}
            className="p-1.5 rounded-full bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground active:scale-90 transition-all border border-white/[0.04]"
            title="Skip forward 10s"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom Timeline & Controls */}
        <div
          className="space-y-1.5 pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Scrubber Progress Bar */}
          <div
            ref={progressBarRef}
            onClick={handleScrubberClick}
            className="group/scrub relative h-2.5 flex items-center cursor-pointer select-none"
          >
            <div className="relative w-full h-1 group-hover/scrub:h-1.5 bg-foreground/15 rounded-full overflow-hidden transition-all">
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-primary-foreground shadow-md opacity-0 group-hover/scrub:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Time & Volume Bar */}
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>
              {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </span>

            <button
              type="button"
              onClick={onToggleMute}
              className="p-1 rounded text-foreground/80 hover:text-foreground active:scale-90 transition-all"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
