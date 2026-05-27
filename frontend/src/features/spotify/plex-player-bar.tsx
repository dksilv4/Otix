import { useState, useEffect, useRef, useCallback } from "react"
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlexIcon } from "@/features/dk-ui/atoms/plex-icon"
import { usePlexPlayer } from "./plex-audio-provider"

function formatTime(ms: number): string {
  if (ms <= 0) return "0:00"
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function PlexPlayerBar() {
  const {
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    stop,
  } = usePlexPlayer()

  const progress = duration > 0 ? position / duration : 0
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      seek(Math.floor(fraction * duration))
    },
    [duration, seek],
  )

  if (!currentTrack) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0a0a0b]/95 backdrop-blur-xl">
      {/* Progress bar */}
      <div
        className="group absolute inset-x-0 -top-0.5 h-1 cursor-pointer"
        onClick={handleProgressClick}
      >
        <div className="h-full bg-white/[0.06]">
          <div
            className="h-full bg-amber-500/80 transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4">
        {/* Track info */}
        <div className="flex w-56 items-center gap-3 shrink-0">
          {currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt={currentTrack.albumName}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-white/[0.04]">
              <PlexIcon className="h-5 w-5 opacity-30" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{currentTrack.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{currentTrack.artist}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-1 items-center justify-center gap-4">
          <button
            onClick={skipPrevious}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-black hover:bg-amber-400 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={skipNext}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Time + Volume */}
        <div className="flex w-56 items-center justify-end gap-3 shrink-0">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatTime(position)} / {formatTime(duration)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <VolumeIcon className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="h-1 w-20 accent-amber-500"
            />
          </div>
          <button
            onClick={stop}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
