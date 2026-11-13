import { useState, useEffect, type RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Film,
  Clapperboard,
  Headphones,
  Subtitles,
  ListVideo,
} from 'lucide-react'
import { Logo } from '@ui/atoms/logo'
import { cn } from '@/lib/utils'
import { formatTime } from '@/features/discover/utils/trailer'
import { getQualityBadgeLabel } from '../../../utils/quality'
import {
  formatAudioTrackLabel,
  formatAudioTrackDetails,
  getAudioBadgeLabel,
  formatSubtitleTrackLabel,
  getSubtitleBadgeLabel,
} from '../../../utils/player'
import { PlayerScrubberBar } from './player-scrubber-bar'
import type { QualityOption, AudioTrack, SubtitleTrack } from '../../../types/stream-player'

export interface PlayerControlsBarProps {
  isTrailer: boolean
  title?: string
  subtitle?: string
  posterUrl?: string | null
  source?: string
  effectiveIsPlaying: boolean
  effectiveIsMuted: boolean
  effectiveVolume: number
  effectiveCurrentTime: number
  effectiveDuration: number
  effectiveIsTheater: boolean
  isZoomedOut: boolean
  isFullscreen: boolean
  isBuffering?: boolean
  showVolumeSlider: boolean
  volumeContainerRef: RefObject<HTMLDivElement | null>
  showQualityMenu: boolean
  currentQuality: string
  availableQualities: QualityOption[]
  activeLevelHeight?: number | null
  audioTracks?: AudioTrack[]
  activeAudio?: AudioTrack | null
  showAudioMenu?: boolean
  setShowAudioMenu?: (updater: boolean | ((prev: boolean) => boolean)) => void
  onSelectAudioTrack?: (index: number) => void
  subtitles?: SubtitleTrack[]
  activeSubtitle?: SubtitleTrack | null
  showSubtitleMenu?: boolean
  setShowSubtitleMenu?: (updater: boolean | ((prev: boolean) => boolean)) => void
  onSelectSubtitleTrack?: (id: string | null) => void
  isOverallPip: boolean
  progressPercent?: number
  bufferedPercent?: number
  isDraggingProgress?: boolean
  progressBarRef?: RefObject<HTMLDivElement | null>
  onProgressMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void
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
  hasQueue?: boolean
  queueCount?: number
  showQueue?: boolean
  onToggleQueue?: () => void
}

export const PlayerControlsBar = ({
  isTrailer,
  title,
  subtitle,
  posterUrl,
  source,
  effectiveIsPlaying,
  effectiveIsMuted,
  effectiveVolume,
  effectiveCurrentTime,
  effectiveDuration,
  effectiveIsTheater,
  isZoomedOut,
  isFullscreen,
  isBuffering = false,
  showVolumeSlider,
  volumeContainerRef,
  showQualityMenu,
  currentQuality,
  availableQualities,
  activeLevelHeight,
  audioTracks,
  activeAudio,
  showAudioMenu = false,
  setShowAudioMenu,
  onSelectAudioTrack,
  subtitles,
  activeSubtitle,
  showSubtitleMenu = false,
  setShowSubtitleMenu,
  onSelectSubtitleTrack,
  isOverallPip,
  progressPercent = 0,
  bufferedPercent = 0,
  isDraggingProgress = false,
  progressBarRef,
  onProgressMouseDown,
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
  hasQueue,
  queueCount,
  showQueue,
  onToggleQueue,
}: PlayerControlsBarProps) => {
  const [coverError, setCoverError] = useState(false)
  const [isVolumeHovered, setIsVolumeHovered] = useState(false)

  useEffect(() => {
    setCoverError(false)
  }, [posterUrl])

  const VolumeIcon =
    effectiveIsMuted || effectiveVolume === 0
      ? VolumeX
      : effectiveVolume < 0.5
      ? Volume1
      : Volume2

  const handleVolumeClick = () => {
    if (effectiveIsMuted) {
      onToggleMute()
      return
    }
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setShowVolumeSlider(!showVolumeSlider)
    } else {
      onToggleMute()
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 sm:gap-2.5 w-full select-none pointer-events-auto transition-[max-width] duration-300',
        effectiveIsTheater || isFullscreen
          ? 'max-w-6xl xl:max-w-7xl 2xl:max-w-[1536px] 3xl:max-w-[1800px]'
          : 'max-w-5xl',
      )}
    >
      {/* Pod 1 (Left): Media Identity & Primary Transport */}
      <div className="h-11 px-2 sm:px-3 rounded-2xl backdrop-blur-2xl bg-[var(--dk-surface-glass)] flex items-center gap-1.5 sm:gap-2.5 shadow-xl flex-[0_1_24%] max-w-[24%] min-w-0 border border-white/[0.04]">
        {/* Media Poster or Video Icon Squircle */}
        <div className="relative shrink-0 flex items-center select-none">
          {posterUrl && !coverError ? (
            <img
              src={posterUrl}
              alt={title || 'Media cover'}
              onError={() => setCoverError(true)}
              className="relative z-10 h-8 w-8 rounded-lg object-cover bg-[var(--dk-surface-raised)] shadow-sm shrink-0 border border-white/10"
            />
          ) : (
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dk-surface-raised)] text-muted-foreground shadow-sm shrink-0">
              {isTrailer ? <Clapperboard className="h-4 w-4" /> : <Film className="h-4 w-4 text-primary" />}
            </div>
          )}
        </div>

        {/* Media Info: Truncates cleanly within Pod 1's boundary */}
        <div className="flex flex-col justify-center min-w-0 max-w-[100px] sm:max-w-[130px] md:max-w-[160px] flex-1 overflow-hidden select-none leading-none gap-0.5">
          <span
            className="truncate block w-full text-xs font-semibold leading-snug text-foreground"
            title={title || (isTrailer ? 'Trailer' : 'Video')}
          >
            {title || (isTrailer ? 'Trailer' : 'Video')}
          </span>
          <span
            className="truncate block w-full text-[10.5px] leading-snug text-muted-foreground"
            title={subtitle || (source ? source.toUpperCase() : isTrailer ? 'YouTube' : 'Media')}
          >
            {subtitle || (source ? source.toUpperCase() : isTrailer ? 'YouTube' : 'Media')}
          </span>
        </div>

        {/* Divider */}
        <div className="h-3.5 w-px shrink-0 bg-white/10" />

        {/* Transport Controls: Skip Back, Play/Pause, Skip Forward */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSeekRelative(isTrailer ? -5 : -10)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
            title={isTrailer ? 'Seek -5s (Left Arrow)' : 'Seek -10s (Left Arrow)'}
            aria-label="Seek backward"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-7.5 w-7.5 items-center justify-center rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition shadow-none border-0 cursor-pointer"
            aria-label={isBuffering ? 'Buffering' : effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
            title={isBuffering ? 'Buffering' : effectiveIsPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isBuffering ? (
              <Logo animateInfinity className="h-3.5 text-primary-foreground" />
            ) : effectiveIsPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSeekRelative(isTrailer ? 5 : 10)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
            title={isTrailer ? 'Seek +5s (Right Arrow)' : 'Seek +10s (Right Arrow)'}
            aria-label="Seek forward"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Pod 2 (Center): Dominant Scrubber / Timeline in its own Pill */}
      <div className="relative h-11 px-3 sm:px-4 rounded-2xl backdrop-blur-2xl bg-[var(--dk-surface-glass)] flex items-center gap-2.5 sm:gap-3 shadow-xl flex-[1_1_52%] min-w-[52%] max-w-[65%] border border-white/[0.04]">
        {/* Current Time */}
        <span className="text-xs font-mono text-muted-foreground shrink-0 select-none">
          {formatTime(effectiveCurrentTime)}
        </span>

        {/* Waveform Scrubber Timeline */}
        <PlayerScrubberBar
          progressBarRef={progressBarRef}
          effectiveDuration={effectiveDuration}
          effectiveCurrentTime={effectiveCurrentTime}
          progressPercent={progressPercent}
          bufferedPercent={bufferedPercent}
          isDraggingProgress={isDraggingProgress}
          isPlaying={effectiveIsPlaying}
          onMouseDown={onProgressMouseDown || (() => {})}
        />

        {/* Duration */}
        <span className="text-xs font-mono text-muted-foreground shrink-0 select-none">
          {formatTime(effectiveDuration)}
        </span>
      </div>

      {/* Pod 3 (Right): Studio & System Controls in its own Compact Pill */}
      <div className="relative h-11 px-1.5 sm:px-2 rounded-2xl backdrop-blur-2xl bg-[var(--dk-surface-glass)] flex items-center gap-0.5 sm:gap-1 shadow-xl flex-[0_1_24%] max-w-[24%] min-w-0 border border-white/[0.04]">
        {/* Responsive Volume Control with Smooth Expandable Slider */}
        <div
          ref={volumeContainerRef}
          className="relative flex items-center group/volume shrink-0"
          onMouseEnter={() => {
            setShowVolumeSlider(true)
            setIsVolumeHovered(true)
          }}
          onMouseLeave={() => {
            setShowVolumeSlider(false)
            setIsVolumeHovered(false)
          }}
          onWheel={(e) => {
            e.preventDefault()
            const delta = e.deltaY < 0 ? 0.05 : -0.05
            onVolumeChange(Math.min(1, Math.max(0, effectiveVolume + delta)))
          }}
        >
          <button
            type="button"
            onClick={handleVolumeClick}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
            aria-label={effectiveIsMuted ? 'Unmute (M)' : 'Mute (M)'}
            title={
              effectiveIsMuted
                ? 'Unmute (M)'
                : `Volume: ${Math.round(effectiveVolume * 100)}% (scroll to adjust)`
            }
          >
            <VolumeIcon className="h-3.5 w-3.5" />
          </button>

          {/* Smooth Inline Slider on Desktop/Tablet (sm+) - expands on hover to keep pill compact */}
          <div
            className={cn(
              'hidden sm:flex items-center overflow-hidden transition-all duration-200 ease-out',
              isVolumeHovered || showVolumeSlider ? 'w-16 px-1 opacity-100' : 'w-0 px-0 opacity-0 pointer-events-none',
            )}
          >
            <input
              type="range"
              role="slider"
              aria-label="Volume slider"
              aria-valuenow={effectiveIsMuted ? 0 : effectiveVolume}
              min="0"
              max="1"
              step="0.02"
              value={effectiveIsMuted ? 0 : effectiveVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-full h-1 cursor-pointer rounded-full accent-primary bg-[var(--dk-surface-raised)] border-0"
            />
          </div>

          {/* Accessible Touch Popover for Small / Mobile Screens (< sm) */}
          <AnimatePresence>
            {showVolumeSlider && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="sm:hidden absolute bottom-full right-0 mb-3 px-3 py-2.5 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl shadow-2xl flex items-center gap-2.5 border border-white/[0.06] z-50 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="text-muted-foreground hover:text-foreground transition-colors border-0 cursor-pointer"
                  aria-label="Mute / Unmute"
                >
                  <VolumeIcon className="h-3.5 w-3.5" />
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={effectiveIsMuted ? 0 : effectiveVolume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  aria-label="Small screen volume slider"
                  className="w-24 h-2 accent-primary cursor-pointer rounded-full border-0"
                />
                <span className="text-[11px] font-mono text-muted-foreground w-8 text-right shrink-0">
                  {Math.round((effectiveIsMuted ? 0 : effectiveVolume) * 100)}%
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Audio Track Menu */}
        {!isTrailer && audioTracks && audioTracks.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowAudioMenu?.((prev) => !prev)
                setShowSubtitleMenu?.(false)
                setShowQualityMenu(false)
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
                showAudioMenu
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
              )}
              title="Audio Track (A)"
              aria-label="Audio Track (A)"
            >
              <Headphones className="h-3.5 w-3.5 shrink-0" />
              <span className="sr-only">
                {getAudioBadgeLabel(activeAudio, audioTracks)}
              </span>
            </button>
            {showAudioMenu && (
              <div
                className="absolute bottom-full right-0 mb-3 w-52 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left border border-white/[0.06] animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-muted-foreground">
                  Audio Track
                </div>
                {audioTracks.map((track) => {
                  const isSelected = activeAudio ? activeAudio.index === track.index : Boolean(track.isDefault)
                  const details = formatAudioTrackDetails(track)
                  return (
                    <button
                      key={track.id || track.index}
                      type="button"
                      onClick={() => {
                        onSelectAudioTrack?.(track.index)
                        setShowAudioMenu?.(false)
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer border-0',
                        isSelected
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate">{formatAudioTrackLabel(track)}</span>
                        {details && <span className="text-[10px] opacity-70 font-mono">{details}</span>}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Subtitle Track Menu */}
        {!isTrailer && subtitles && subtitles.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSubtitleMenu?.((prev) => !prev)
                setShowAudioMenu?.(false)
                setShowQualityMenu(false)
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
                showSubtitleMenu
                  ? 'bg-primary text-primary-foreground'
                  : activeSubtitle
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
              )}
              title="Subtitles (C)"
              aria-label="Subtitles (C)"
            >
              <Subtitles className="h-3.5 w-3.5 shrink-0" />
              <span className="sr-only">
                {getSubtitleBadgeLabel(activeSubtitle)}
              </span>
            </button>
            {showSubtitleMenu && (
              <div
                className="absolute bottom-full right-0 mb-3 w-52 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left border border-white/[0.06] animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-muted-foreground">
                  Subtitles
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSubtitleTrack?.(null)
                    setShowSubtitleMenu?.(false)
                  }}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer border-0',
                    !activeSubtitle
                      ? 'bg-primary/20 text-primary font-bold'
                      : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
                  )}
                >
                  <span>Off</span>
                  {!activeSubtitle && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
                {subtitles.map((track) => {
                  const isSelected = Boolean(
                    activeSubtitle &&
                      (activeSubtitle.id === track.id ||
                        String(activeSubtitle.index) === String(track.index)),
                  )
                  return (
                    <button
                      key={track.id || track.index}
                      type="button"
                      onClick={() => {
                        onSelectSubtitleTrack?.(track.id || String(track.index))
                        setShowSubtitleMenu?.(false)
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer border-0',
                        isSelected
                          ? 'bg-primary/20 text-primary font-bold'
                          : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate">{formatSubtitleTrackLabel(track)}</span>
                        {track.format && (
                          <span className="text-[10px] opacity-70 uppercase font-mono">
                            {track.format}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Stream Quality Menu */}
        {!isTrailer && (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowQualityMenu((prev) => !prev)
                setShowAudioMenu?.(false)
                setShowSubtitleMenu?.(false)
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
                showQualityMenu
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
              )}
              title="Video Quality (Q)"
              aria-label="Video Quality (Q)"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" />
              <span className="sr-only">
                {getQualityBadgeLabel(currentQuality, availableQualities, activeLevelHeight)}
              </span>
            </button>
            {showQualityMenu && (
              <div
                className="absolute bottom-full right-0 mb-3 w-48 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-1.5 shadow-2xl z-50 text-left border border-white/[0.06] animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-muted-foreground">
                  Quality
                </div>
                {availableQualities.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onSelectQuality(q.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-xl text-xs transition-colors flex items-center justify-between cursor-pointer border-0',
                      currentQuality === q.id
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
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

        {/* Upcoming Queue Toggle */}
        {!isTrailer && hasQueue && (
          <button
            type="button"
            onClick={onToggleQueue}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
              showQueue
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
            )}
            title={showQueue ? 'Hide Queue' : `Up Next (${queueCount ?? 0})`}
            aria-label={showQueue ? 'Hide Queue' : 'Show Queue'}
          >
            <ListVideo className="h-3.5 w-3.5 shrink-0" />
            {queueCount != null && queueCount > 0 && !showQueue && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] px-0.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground pointer-events-none">
                {queueCount}
              </span>
            )}
          </button>
        )}

        {/* Visual Divider between Audio/Quality and Window/Display Tools */}
        <div className="h-3 w-px shrink-0 bg-white/10 mx-0.5" />

        {/* Zoom & Fit Toggle (Fit vs Fill) */}
        <button
          type="button"
          onClick={onToggleZoom}
          className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
          title={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
          aria-label={isZoomedOut ? 'Zoom in to fill (Z)' : 'Zoom out to fit (Z)'}
        >
          {isZoomedOut ? <ZoomIn className="h-3.5 w-3.5" /> : <ZoomOut className="h-3.5 w-3.5" />}
        </button>

        {/* In-app PiP mode */}
        {!isTrailer && (
          <button
            type="button"
            onClick={onToggleInAppPip}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
            title="Minimize to in-app player (I)"
            aria-label="In-app picture-in-picture"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* OS PiP */}
        {!isTrailer && (
          <button
            type="button"
            onClick={onToggleOverallPip}
            className={cn(
              'hidden sm:flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
              isOverallPip
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
            )}
            title="Picture-in-Picture (OS window) (P)"
            aria-label="OS picture-in-picture"
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Theater mode (Full width in app) */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={onToggleTheater}
            className={cn(
              'hidden md:flex h-7 w-7 items-center justify-center rounded-full transition-colors border-0 cursor-pointer',
              effectiveIsTheater
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/10',
            )}
            aria-label={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
            title={effectiveIsTheater ? 'Exit theater mode (T)' : 'Theater mode (T)'}
          >
            <Tv className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Fullscreen in monitor */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors border-0 cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          aria-label="Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
