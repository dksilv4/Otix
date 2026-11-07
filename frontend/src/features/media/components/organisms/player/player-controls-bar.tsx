import type { RefObject } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Settings2,
  Minimize2,
  PictureInPicture2,
  Tv,
  Maximize2,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/features/discover/utils/trailer'
import { getQualityBadgeLabel } from '../../../utils/quality'
import type { QualityOption } from '../../../types/stream-player'

export interface PlayerControlsBarProps {
  isTrailer: boolean
  effectiveIsPlaying: boolean
  effectiveIsMuted: boolean
  effectiveVolume: number
  effectiveCurrentTime: number
  effectiveDuration: number
  effectiveIsTheater: boolean
  isZoomedOut: boolean
  isFullscreen: boolean
  showVolumeSlider: boolean
  volumeContainerRef: RefObject<HTMLDivElement | null>
  showQualityMenu: boolean
  currentQuality: string
  availableQualities: QualityOption[]
  activeLevelHeight?: number | null
  isOverallPip: boolean
  onTogglePlay: () => void
  onSeekRelative: (seconds: number) => void
  onToggleMute: () => void
  onVolumeChange: (vol: number) => void
  setShowVolumeSlider: (show: boolean) => void
  onToggleZoom: () => void
  setShowQualityMenu: (updater: boolean | ((prev: boolean) => boolean)) => void
  onSelectQuality: (id: string) => void
  onToggleInAppPip: () => void
  onToggleOverallPip: () => void
  onToggleTheater: () => void
  onToggleFullscreen: () => void
}

export const PlayerControlsBar = ({
  isTrailer,
  effectiveIsPlaying,
  effectiveIsMuted,
  effectiveVolume,
  effectiveCurrentTime,
  effectiveDuration,
  effectiveIsTheater,
  isZoomedOut,
  isFullscreen,
  showVolumeSlider,
  volumeContainerRef,
  showQualityMenu,
  currentQuality,
  availableQualities,
  activeLevelHeight,
  isOverallPip,
  onTogglePlay,
  onSeekRelative,
  onToggleMute,
  onVolumeChange,
  setShowVolumeSlider,
  onToggleZoom,
  setShowQualityMenu,
  onSelectQuality,
  onToggleInAppPip,
  onToggleOverallPip,
  onToggleTheater,
  onToggleFullscreen,
}: PlayerControlsBarProps) => {
  const VolumeIcon = effectiveIsMuted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2

  return (
    <div className="flex items-center justify-between gap-2 pointer-events-auto">
      {/* Left controls: Play/Pause, Skip, Volume, Time */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] hover:bg-white/15 text-primary-foreground backdrop-blur-xl shadow-lg transition-all border-0 cursor-pointer"
          aria-label={effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
          title={effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {effectiveIsPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current ml-0.5" />
          )}
        </button>

        {!isTrailer && (
          <>
            <button
              type="button"
              onClick={() => onSeekRelative(-10)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
              title="Seek -10s (Left Arrow)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSeekRelative(10)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
              title="Seek +10s (Right Arrow)"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Volume popover */}
        <div
          ref={volumeContainerRef}
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
          onWheel={(e) => {
            e.preventDefault()
            const delta = e.deltaY < 0 ? 0.05 : -0.05
            onVolumeChange(Math.min(1, Math.max(0, effectiveVolume + delta)))
          }}
          className="relative flex items-center group/volume"
        >
          <button
            type="button"
            onClick={onToggleMute}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
            aria-label={effectiveIsMuted ? 'Unmute (M)' : 'Mute (M)'}
            title={effectiveIsMuted ? 'Unmute (M)' : `Volume: ${Math.round(effectiveVolume * 100)}% (scroll to adjust)`}
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          {showVolumeSlider && (
            <div className="absolute left-full pl-2 flex items-center z-30">
              <div className="px-3 py-2 rounded-full bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-xl flex items-center gap-2 border border-white/[0.04]">
                <input
                  type="range"
                  role="slider"
                  aria-label="Volume slider"
                  aria-valuenow={effectiveIsMuted ? 0 : effectiveVolume}
                  min="0"
                  max="1"
                  step="0.05"
                  value={effectiveIsMuted ? 0 : effectiveVolume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-primary cursor-pointer border-0"
                />
                <span className="text-[11px] font-mono text-muted-foreground w-7 text-right">
                  {Math.round((effectiveIsMuted ? 0 : effectiveVolume) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground pl-1 truncate">
          <span>{formatTime(effectiveCurrentTime)}</span>
          <span className="opacity-50">/</span>
          <span className="opacity-70">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* Right controls: Zoom, Quality, Tracks, PiP, Theater, Fullscreen */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {isTrailer && (
          <button
            type="button"
            onClick={onToggleZoom}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
            aria-label={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
            title={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
          >
            {isZoomedOut ? <ZoomIn className="h-4 w-4" /> : <ZoomOut className="h-4 w-4" />}
          </button>
        )}

        {/* Stream Quality Menu */}
        {!isTrailer && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQualityMenu((prev) => !prev)}
              className={cn(
                'flex h-8 px-2.5 items-center gap-1 rounded-full text-xs font-medium transition-all border-0 cursor-pointer',
                showQualityMenu
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
              )}
              title="Video Quality (Q)"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{getQualityBadgeLabel(currentQuality, availableQualities, activeLevelHeight)}</span>
            </button>
            {showQualityMenu && (
              <div
                className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left border-0 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-muted-foreground">Quality</div>
                {availableQualities.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onSelectQuality(q.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer',
                      currentQuality === q.id
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'text-muted-foreground hover:bg-white/10 hover:text-primary-foreground'
                    )}
                  >
                    <span>{q.label}</span>
                    {currentQuality === q.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* In-app PiP mode */}
        {!isTrailer && (
          <button
            type="button"
            onClick={onToggleInAppPip}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
            title="Minimize to in-app player (I)"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}

        {/* OS PiP */}
        {!isTrailer && (
          <button
            type="button"
            onClick={onToggleOverallPip}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-all border-0 cursor-pointer',
              isOverallPip
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
            )}
            title="Picture-in-Picture (OS window) (P)"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}

        {/* Theater mode */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={onToggleTheater}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-all border-0 cursor-pointer',
              effectiveIsTheater
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-primary-foreground hover:bg-white/10'
            )}
            aria-label={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
            title={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
          >
            <Tv className="h-4 w-4" />
          </button>
        )}

        {/* Fullscreen */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border-0 cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
