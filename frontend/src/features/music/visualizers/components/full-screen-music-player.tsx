import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Maximize2,
  Minimize2,
  X,
  Disc3,
  Box,
  SlidersHorizontal,
} from 'lucide-react'
import { usePlayer } from '@/lib/player/use-player'
import { usePlayerProgress } from '@/lib/player/use-player-progress'
import { useMusicPalette } from '../../hooks/use-music-palette'
import { useFullScreenPlayer } from '../hooks/use-full-screen-player'
import { useAudioVisualizer } from '../hooks/use-audio-visualizer'
import { Simple2DVisualizerCanvas } from './simple-2d-visualizer-canvas'
import { MeshGridVisualizerCanvas } from './mesh-grid-visualizer-canvas'
import { WaveformScrubber } from './waveform-scrubber'
import { FullScreenQueuePanel } from './full-screen-queue-panel'
import { MeshGridControlsPanel } from './mesh-grid-controls-panel'
import type { VisualizerMode } from '../types'
import { getNextVisualizerMode, getVisualizerModeOption } from '../utils/visualizer-helpers'
import {
  getSavedVisualizerParams,
  saveVisualizerParams,
  getSavedVisualizerMode,
  saveVisualizerMode,
  applyPresetWithPersistentPreferences,
} from '../utils/visualizer-persistence'
import {
  type MeshGridParams,
  type MeshGridVariantPreset,
  type MeshGridSceneHandle,
  type CameraSnapPresetId,
  CAMERA_SNAP_PRESETS,
  MESH_GRID_VARIANT_14_CONFIG,
} from '../utils/mesh-grid-helpers'
import { cn } from '@/lib/utils'

export interface FullScreenMusicPlayerProps {
  isOpen: boolean
  onClose: () => void
}

export const FullScreenMusicPlayer = ({ isOpen, onClose }: FullScreenMusicPlayerProps) => {
  const {
    source,
    isPlaying,
    currentTrack,
    volume,
    repeatMode,
    isShuffled,
    togglePlay,
    skipNext,
    skipPrevious,
    seek,
    setVolume,
    toggleShuffle,
    setRepeatMode,
    removeFromQueue,
    localQueue,
    plexQueue,
    jellyfinQueue,
    skipLocalToIndex,
    skipPlexToIndex,
    skipJellyfinToIndex,
  } = usePlayer()

  const { position, duration } = usePlayerProgress()
  const theme = useMusicPalette(currentTrack?.albumArt)
  const frame = useAudioVisualizer(position, duration, isPlaying, isOpen)

  const activeQueue =
    (source === 'local' ? localQueue : source === 'jellyfin' ? jellyfinQueue : plexQueue) ?? []

  const {
    isQueueOpen,
    toggleQueue,
    isControlsVisible,
    resetHideTimer,
    isNativeFullscreen,
    toggleNativeFullscreen,
  } = useFullScreenPlayer(
    isOpen,
    onClose,
    () => void togglePlay(),
    () => void skipNext(),
    () => void skipPrevious(),
    (ms) => void seek(ms),
    position,
  )

  const [prevVolume, setPrevVolume] = useState(0.7)
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(() => getSavedVisualizerMode())
  const [isMeshControlsOpen, setIsMeshControlsOpen] = useState(false)
  const [meshParams, setMeshParams] = useState<MeshGridParams>(() => getSavedVisualizerParams())
  const sceneHandleRef = useRef<MeshGridSceneHandle | null>(null)

  const handleSceneReady = useCallback((handle: MeshGridSceneHandle) => {
    sceneHandleRef.current = handle
  }, [])

  const handleMeshParamChange = useCallback(
    <K extends keyof MeshGridParams>(key: K, value: MeshGridParams[K]) => {
      setMeshParams((prev) => {
        const next = {
          ...prev,
          [key]: value,
        }
        saveVisualizerParams(next)
        return next
      })
    },
    [],
  )

  const handleApplyMeshPreset = useCallback((preset: MeshGridVariantPreset) => {
    setMeshParams((prev) => {
      const next = applyPresetWithPersistentPreferences(prev, preset.params)
      if (!prev.lockCameraOnPresetChange) {
        sceneHandleRef.current?.setCamera(preset.params.cameraPosition, preset.params.cameraTarget)
        if (preset.params.cameraFov) {
          sceneHandleRef.current?.setCameraFov(preset.params.cameraFov)
        }
      }
      saveVisualizerParams(next)
      return next
    })
  }, [])

  const handleResetMeshParams = useCallback(() => {
    setMeshParams((prev) => {
      const next = applyPresetWithPersistentPreferences(prev, MESH_GRID_VARIANT_14_CONFIG)
      if (!prev.lockCameraOnPresetChange) {
        sceneHandleRef.current?.resetCamera()
      }
      saveVisualizerParams(next)
      return next
    })
  }, [])

  const handleResetMeshCamera = useCallback(() => {
    sceneHandleRef.current?.resetCamera()
    setMeshParams((prev) => {
      const next = {
        ...prev,
        cameraPosition: { ...MESH_GRID_VARIANT_14_CONFIG.cameraPosition },
        cameraTarget: { ...MESH_GRID_VARIANT_14_CONFIG.cameraTarget },
        cameraFov: MESH_GRID_VARIANT_14_CONFIG.cameraFov,
      }
      saveVisualizerParams(next)
      return next
    })
  }, [])

  const handleSnapCamera = useCallback((snapId: CameraSnapPresetId) => {
    sceneHandleRef.current?.snapCameraTo(snapId)
    const snap = CAMERA_SNAP_PRESETS.find((s) => s.id === snapId)
    if (snap) {
      setMeshParams((prev) => {
        const next = {
          ...prev,
          cameraPosition: { ...snap.position },
          cameraTarget: { ...snap.target },
          cameraFov: snap.fov,
        }
        saveVisualizerParams(next)
        return next
      })
    }
  }, [])

  const handleCameraChange = useCallback(
    (pos: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => {
      setMeshParams((prev) => {
        const next = {
          ...prev,
          cameraPosition: pos,
          cameraTarget: target,
        }
        saveVisualizerParams(next)
        return next
      })
    },
    [],
  )

  const handleImportSeed = useCallback((importedParams: MeshGridParams) => {
    setMeshParams(importedParams)
    saveVisualizerParams(importedParams)
    sceneHandleRef.current?.setParams(importedParams, { updateCamera: true })
    if (importedParams.cameraPosition && importedParams.cameraTarget) {
      sceneHandleRef.current?.setCamera(importedParams.cameraPosition, importedParams.cameraTarget)
    }
    if (importedParams.cameraFov) {
      sceneHandleRef.current?.setCameraFov(importedParams.cameraFov)
    }
  }, [])

  const currentModeOption = getVisualizerModeOption(visualizerMode)

  const cycleVisualizerMode = useCallback(() => {
    setVisualizerMode((prev) => {
      const next = getNextVisualizerMode(prev)
      saveVisualizerMode(next)
      return next
    })
  }, [])

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      setPrevVolume(volume)
      setVolume(0)
    } else {
      setVolume(prevVolume || 0.7)
    }
  }, [volume, prevVolume, setVolume])

  const cycleRepeat = useCallback(() => {
    if (repeatMode === 'off') setRepeatMode('all')
    else if (repeatMode === 'all') setRepeatMode('one')
    else setRepeatMode('off')
  }, [repeatMode, setRepeatMode])

  const handleSelectTrack = useCallback(
    (index: number) => {
      if (source === 'local') skipLocalToIndex(index)
      else if (source === 'jellyfin') skipJellyfinToIndex(index)
      else skipPlexToIndex(index)
    },
    [source, skipLocalToIndex, skipJellyfinToIndex, skipPlexToIndex],
  )

  if (!isOpen) return null

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <AnimatePresence>
      <motion.div
        key="full-screen-player-overlay"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={resetHideTimer}
        className="fixed inset-0 z-[10000] flex flex-col justify-between overflow-hidden select-none bg-background"
      >
        {/* Layer 1: Dynamic Audio Visualizer Canvas */}
        {visualizerMode === 'mesh-grid' ? (
          <MeshGridVisualizerCanvas
            isPlaying={isPlaying}
            positionMs={position}
            durationMs={duration}
            trackId={currentTrack?.id}
            albumArt={currentTrack?.albumArt}
            palette={theme.palette}
            params={meshParams}
            onSceneReady={handleSceneReady}
            onCameraChange={handleCameraChange}
            className="absolute inset-0 h-full w-full pointer-events-auto"
          />
        ) : (
          <Simple2DVisualizerCanvas
            isPlaying={isPlaying}
            positionMs={position}
            durationMs={duration}
            theme={theme}
            className="absolute inset-0 h-full w-full pointer-events-none"
          />
        )}

        {/* Layer 2: Top Navigation Chrome */}
        <header
          className={cn(
            'relative z-20 flex items-center justify-between px-6 py-5 transition-opacity duration-500 ease-out',
            isControlsVisible || isMeshControlsOpen || isQueueOpen
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none',
          )}
        >
          {/* Left: Now Playing Status Badge */}
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest font-semibold text-primary px-3 py-1 rounded-full bg-[var(--dk-surface-ghost-hover)] backdrop-blur-md">
              {currentTrack ? 'Now Playing' : 'Visualizer Ready'}
            </span>
            {source !== 'none' && (
              <span className="hidden md:inline-flex text-[11px] uppercase tracking-wider font-mono text-muted-foreground px-2.5 py-0.5 rounded-full bg-[var(--dk-surface-raised)] backdrop-blur-md">
                {source}
              </span>
            )}
            {isPlaying && (frame.bpm ?? 0) > 0 && (
              <span className="hidden sm:inline-flex text-[11px] font-mono text-muted-foreground px-2.5 py-0.5 rounded-full bg-[var(--dk-surface-raised)] backdrop-blur-md">
                {Math.round(frame.bpm!)} BPM
              </span>
            )}
          </div>

          {/* Center: Subtle Track Info in Header (Only when controls visible, never blocking visualizer) */}
          <div className="hidden sm:flex flex-col items-center max-w-sm md:max-w-md truncate px-4 pointer-events-none">
            <span
              className="text-sm font-semibold truncate leading-tight"
              style={{ color: theme.textColor }}
            >
              {currentTrack?.title || 'No Track Playing'}
            </span>
            <span
              className="text-xs truncate leading-tight mt-0.5"
              style={{ color: theme.subtextColor }}
            >
              {currentTrack?.artist || 'Playback is idle'}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Visualizer Mode Switcher */}
            <button
              type="button"
              onClick={cycleVisualizerMode}
              className="h-9 px-3 flex items-center gap-2 rounded-xl backdrop-blur-md bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground transition-colors duration-200"
              title={`Active visualizer: ${currentModeOption.name}. Click to switch mode.`}
              aria-label={`Visualizer mode: ${currentModeOption.name}`}
            >
              <Box className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">{currentModeOption.name}</span>
            </button>

            {/* Mesh Grid Parameters Controls Toggle (when in mesh-grid mode) */}
            {visualizerMode === 'mesh-grid' && (
              <button
                type="button"
                onClick={() => {
                  setIsMeshControlsOpen((prev) => {
                    const next = !prev
                    if (next && isQueueOpen) toggleQueue()
                    return next
                  })
                }}
                className={cn(
                  'h-9 px-3 flex items-center gap-2 rounded-xl backdrop-blur-md transition-colors',
                  isMeshControlsOpen
                    ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
                )}
                title="Mesh Grid Parameters Controls"
                aria-label="Mesh Grid Parameters Controls"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-xs font-medium hidden md:inline">Controls</span>
              </button>
            )}

            {/* Queue Toggle Button */}
            <button
              type="button"
              onClick={() => {
                if (!isQueueOpen && isMeshControlsOpen) {
                  setIsMeshControlsOpen(false)
                }
                toggleQueue()
              }}
              className={cn(
                'h-9 px-3 flex items-center gap-2 rounded-xl backdrop-blur-md transition-colors',
                isQueueOpen
                  ? 'text-primary bg-[var(--dk-surface-ghost-hover)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
              title="Toggle Queue"
              aria-label="Toggle Queue"
            >
              <ListMusic className="h-4 w-4" />
              {(activeQueue?.length ?? 0) > 0 && (
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--dk-surface-raised)]">
                  {activeQueue.length}
                </span>
              )}
            </button>

            {/* Native Fullscreen Button */}
            <button
              type="button"
              onClick={toggleNativeFullscreen}
              className="h-9 w-9 flex items-center justify-center rounded-xl backdrop-blur-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title={isNativeFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label="Fullscreen"
            >
              {isNativeFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center rounded-xl backdrop-blur-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
              title="Close Full Screen Player (Esc)"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Center: Unobstructed Canvas Visualizer Area */}
        <div className="flex-1 min-h-0 pointer-events-none" />

        {/* Layer 3: Floating Bottom Dock (Unified 2-Pod Design Matching Main Player) */}
        <footer
          className={cn(
            'relative z-20 flex items-center justify-center pb-8 px-6 transition-opacity duration-500 ease-out select-none',
            isControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 w-[calc(100%-1.5rem)] max-w-5xl">
            {/* Pod 1 (Left): Ultra-Compact Track Identity & Music Transport */}
            <div
              className="h-13 px-2.5 sm:px-3 rounded-2xl backdrop-blur-2xl flex items-center gap-2 sm:gap-2.5 shadow-xl shrink-0 transition-[background,box-shadow] duration-500"
              style={{
                background: theme.containerBackground,
                boxShadow: theme.glowShadow,
              }}
            >
              {/* Vinyl Artwork Squircle */}
              <div
                className="relative shrink-0 flex items-center group select-none"
                title={currentTrack ? `${currentTrack.title} • ${currentTrack.artist}` : 'Otix Music Visualizer'}
              >
                {currentTrack?.albumArt ? (
                  <img
                    src={currentTrack.albumArt}
                    alt={currentTrack.title}
                    className="relative z-10 h-10 w-10 rounded-xl object-cover bg-[var(--dk-surface-raised)] shadow-sm"
                  />
                ) : (
                  <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dk-surface-raised)] text-muted-foreground shadow-sm">
                    <Disc3 className="h-5 w-5" />
                  </div>
                )}
                <div
                  className={cn(
                    'absolute -right-2 top-1 h-8 w-8 rounded-full bg-[var(--dk-surface-overlay)] flex items-center justify-center z-0 transition-transform duration-700 pointer-events-none shadow-sm',
                    isPlaying && 'animate-[spin_10s_linear_infinite]',
                  )}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: theme.hasArtwork ? theme.accentRgb : 'var(--primary)',
                    }}
                  />
                </div>
              </div>

              {/* 2-Tier / 2-Row Metadata: Legible Title & Subtitle */}
              <div
                className="flex flex-col justify-center min-w-0 max-w-[100px] sm:max-w-[140px] select-none leading-none"
                title={currentTrack ? `${currentTrack.title} • ${currentTrack.artist}` : 'No Track'}
              >
                <span
                  className="truncate text-xs font-semibold leading-snug transition-colors"
                  style={{ color: theme.textColor }}
                >
                  {currentTrack?.title || 'No Track'}
                </span>
                <span
                  className="truncate text-[10.5px] leading-snug transition-colors opacity-80"
                  style={{ color: theme.subtextColor }}
                >
                  {currentTrack?.artist || 'Idle'}
                </span>
              </div>

              {/* Divider */}
              <div
                className="h-4 w-px shrink-0 transition-colors"
                style={{ backgroundColor: theme.dividerColor }}
              />

              {/* Transport Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void skipPrevious()}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Previous track"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>

                <div className="relative flex items-center justify-center">
                  {isPlaying && (
                    <div
                      className="absolute -inset-1 rounded-full blur-sm opacity-60 animate-pulse pointer-events-none"
                      style={{
                        backgroundColor: theme.hasArtwork ? theme.accentRgb : 'var(--primary)',
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void togglePlay()}
                    className={cn(
                      'relative z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-md hover:scale-105 active:scale-95 transition-colors',
                      !theme.hasArtwork && 'bg-primary text-primary-foreground',
                    )}
                    style={
                      theme.hasArtwork
                        ? {
                            backgroundColor: theme.accentRgb,
                            color: theme.accentText,
                            boxShadow: `0 2px 10px ${theme.accentRgba(0.35)}`,
                          }
                        : undefined
                    }
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void skipNext()}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Next track"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Pod 2 (Right): Dominant Expansive Waveform Scrubber & Controls */}
            <div
              className="relative h-13 px-3 sm:px-4 rounded-2xl backdrop-blur-2xl flex items-center gap-2.5 sm:gap-3 shadow-xl flex-1 min-w-0 transition-[background,box-shadow] duration-500"
              style={{
                background: theme.containerBackground,
                boxShadow: theme.glowShadow,
              }}
            >
              {/* Expansive Dominant Waveform Scrubber (60fps Canvas) */}
              <WaveformScrubber
                positionMs={position}
                durationMs={duration}
                isPlaying={isPlaying}
                theme={theme}
                onSeek={(ms) => void seek(ms)}
                barCount={84}
                className="flex-1 min-w-0"
              />

              {/* Divider */}
              <div
                className="h-4 w-px shrink-0 transition-colors"
                style={{ backgroundColor: theme.dividerColor }}
              />

              {/* Shuffle & Repeat Toggles */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleShuffle()}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: isShuffled ? theme.accentRgb : theme.iconColor }}
                  title="Shuffle"
                  aria-label="Shuffle"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={cycleRepeat}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: repeatMode !== 'off' ? theme.accentRgb : theme.iconColor }}
                  title={`Repeat: ${repeatMode}`}
                  aria-label={`Repeat: ${repeatMode}`}
                >
                  <RepeatIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Volume */}
              <div
                className="flex items-center group/volume shrink-0"
                onWheel={(e) => {
                  e.preventDefault()
                  setVolume(Math.min(1, Math.max(0, volume + (e.deltaY < 0 ? 0.05 : -0.05))))
                }}
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  style={{ color: theme.iconColor }}
                  aria-label="Volume"
                  title={volume === 0 ? 'Unmute' : `Volume: ${Math.round(volume * 100)}%`}
                >
                  <VolumeIcon className="h-3.5 w-3.5" />
                </button>

                <div className="hidden xl:flex items-center w-14 px-1">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    aria-label="Volume slider"
                    className="w-full h-1 cursor-pointer rounded-full accent-primary bg-[var(--dk-surface-raised)]"
                    style={theme.hasArtwork ? { accentColor: theme.accentRgb } : undefined}
                  />
                </div>
              </div>

              {/* Queue Button */}
              <button
                type="button"
                onClick={toggleQueue}
                className="relative flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                style={{ color: isQueueOpen ? theme.accentRgb : theme.iconColor }}
                title="Queue & Up Next"
                aria-label="Queue & Up Next"
              >
                <ListMusic className="h-3.5 w-3.5" />
                {(activeQueue?.length ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3 min-w-[12px] px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-mono flex items-center justify-center font-bold">
                    {activeQueue.length}
                  </span>
                )}
              </button>

              {/* Minimize / Exit Fullscreen Button */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-7.5 w-7.5 items-center justify-center rounded-full hover:bg-[var(--dk-surface-ghost-hover)] transition-colors shrink-0"
                style={{ color: theme.iconColor }}
                title="Exit Full Screen Player (Esc)"
                aria-label="Exit Full Screen"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </footer>

        {/* Slide-out Queue Panel */}
        <FullScreenQueuePanel
          isOpen={isQueueOpen}
          onClose={() => toggleQueue()}
          queue={activeQueue || []}
          currentTrack={currentTrack}
          theme={theme}
          repeatMode={repeatMode}
          isShuffled={isShuffled}
          onToggleShuffle={() => toggleShuffle()}
          onCycleRepeat={cycleRepeat}
          onSelectTrack={handleSelectTrack}
          onRemoveTrack={(idx) => removeFromQueue(idx)}
        />

        {/* Slide-out Mesh Grid Controls Panel */}
        {visualizerMode === 'mesh-grid' && (
          <MeshGridControlsPanel
            isOpen={isMeshControlsOpen}
            onClose={() => setIsMeshControlsOpen(false)}
            params={meshParams}
            onParamChange={handleMeshParamChange}
            onApplyPreset={handleApplyMeshPreset}
            onResetParams={handleResetMeshParams}
            onResetCamera={handleResetMeshCamera}
            onSnapCamera={handleSnapCamera}
            onImportSeed={handleImportSeed}
            theme={theme}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
