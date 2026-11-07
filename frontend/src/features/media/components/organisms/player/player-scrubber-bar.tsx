import type { RefObject } from 'react'

export interface PlayerScrubberBarProps {
  progressBarRef: RefObject<HTMLDivElement | null>
  effectiveDuration: number
  effectiveCurrentTime: number
  progressPercent: number
  bufferedPercent: number
  isDraggingProgress: boolean
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}

export const PlayerScrubberBar = ({
  progressBarRef,
  effectiveDuration,
  effectiveCurrentTime,
  progressPercent,
  bufferedPercent,
  isDraggingProgress,
  onMouseDown,
}: PlayerScrubberBarProps) => {
  return (
    <div
      ref={progressBarRef}
      role="slider"
      tabIndex={0}
      aria-label="Video timeline"
      aria-valuemin={0}
      aria-valuemax={effectiveDuration || 100}
      aria-valuenow={effectiveCurrentTime}
      onMouseDown={onMouseDown}
      className="relative h-4 flex items-center cursor-pointer group pointer-events-auto select-none border-0"
    >
      <div className="h-1.5 w-full rounded-full bg-white/15 group-hover:h-2 transition-all duration-150 overflow-hidden relative border-0">
        {bufferedPercent > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-all duration-300 border-0"
            style={{ width: `${bufferedPercent}%` }}
          />
        )}
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] transition-all duration-75 border-0"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {(progressPercent > 0 || isDraggingProgress) && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-primary-foreground shadow-[0_0_8px_rgba(0,0,0,0.6)] transition-opacity duration-150 border-0 ${
            isDraggingProgress ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${progressPercent}%` }}
        />
      )}
    </div>
  )
}
