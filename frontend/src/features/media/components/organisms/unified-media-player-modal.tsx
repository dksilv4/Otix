/* eslint-disable react-hooks/refs */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MediaPlayerInAppPipOverlay } from '../molecules/media-player-in-app-pip-overlay'
import { useUnifiedPlayerState } from '../../hooks/use-unified-player-state'
import { PlayerHeader } from './player/player-header'
import { PlayerControlsBar } from './player/player-controls-bar'
import { PlayerShortcutsModal } from './player/player-shortcuts-modal'
import { PlayerVideoSurface } from './player/player-video-surface'
import { PlayerQueuePanel } from './player/player-queue-panel'
import type { UnifiedMediaPlayerModalProps } from '../../types/unified-player'

export const UnifiedMediaPlayerModal = (props: UnifiedMediaPlayerModalProps = {}) => {
  const state = useUnifiedPlayerState(props)
  const { isVisible, effectiveIsTheater, controls } = state
  const { controlsVisible, toggleTheater, showControls } = controls

  const hasQueue = Boolean(!state.isTrailer && state.queue && state.queue.length > 0)
  const [showQueue, setShowQueue] = useState(true)

  useEffect(() => {
    if (hasQueue) {
      setShowQueue(true)
    }
  }, [hasQueue])

  useEffect(() => {
    if (!isVisible) return

    const syncState = () => {
      window.dispatchEvent(
        new CustomEvent('otix:player-theater-sync', {
          detail: {
            isOpen: isVisible,
            isTheater: effectiveIsTheater,
            controlsVisible,
          },
        }),
      )
    }

    syncState()

    const handleExitTheater = () => {
      if (effectiveIsTheater) {
        toggleTheater()
      }
    }

    const handleShowControls = () => {
      showControls()
    }

    window.addEventListener('otix:exit-theater', handleExitTheater)
    window.addEventListener('otix:player-show-controls', handleShowControls)

    return () => {
      window.removeEventListener('otix:exit-theater', handleExitTheater)
      window.removeEventListener('otix:player-show-controls', handleShowControls)
      window.dispatchEvent(
        new CustomEvent('otix:player-theater-sync', {
          detail: {
            isOpen: false,
            isTheater: false,
            controlsVisible: true,
          },
        }),
      )
    }
  }, [isVisible, effectiveIsTheater, controlsVisible, toggleTheater, showControls])

  if (typeof document === 'undefined' || (!state.isVisible && !state.isInAppPip)) {
    return null
  }

  // In-app PiP mode render (stream mode)
  if (!state.isTrailer && state.isInAppPip) {
    return createPortal(
      <div className="fixed bottom-6 right-6 z-50 w-80 aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border-0">
        <video
          ref={state.engine.setVideoRef}
          playsInline
          className="w-full h-full object-contain"
          onTimeUpdate={() => {
            if (state.engine.videoRef.current && !state.controls.isDraggingProgress) {
              state.onTimeUpdate(
                state.engine.videoRef.current.currentTime,
                state.engine.videoRef.current.duration || state.streamDuration,
              )
            }
          }}
          onProgress={() => {
            if (state.engine.videoRef.current && state.engine.videoRef.current.buffered.length > 0) {
              const bufferedEnd = state.engine.videoRef.current.buffered.end(
                state.engine.videoRef.current.buffered.length - 1,
              )
              state.onBufferedUpdate(bufferedEnd)
            }
          }}
          onEnded={() => state.streamPlayer.onVideoEnded?.()}
        />
        <MediaPlayerInAppPipOverlay
          title={state.effectiveTitle}
          source={state.activeStreamSession?.source || ''}
          isPlaying={state.streamIsPlaying}
          isBuffering={state.isBuffering}
          isOverallPip={state.isOverallPip}
          currentTime={state.streamCurrentTime}
          duration={state.streamDuration}
          isMuted={state.streamIsMuted}
          controlsVisible={state.controls.controlsVisible}
          onTogglePlay={state.controls.handleTogglePlay}
          onSkipBack={() => state.controls.handleSeekRelative(-10)}
          onSkipForward={() => state.controls.handleSeekRelative(10)}
          onSeek={state.controls.handleSeekRelative}
          onToggleMute={state.controls.handleToggleMute}
          onRestore={() => state.setInAppPip(false)}
          onToggleOverallPip={state.toggleOverallPip}
          onClose={state.controls.handleClose}
        />
      </div>,
      document.body,
    )
  }

  const controlsBar = (
    <PlayerControlsBar
      isTrailer={state.isTrailer}
      title={state.effectiveTitle}
      subtitle={state.effectiveSubtitle}
      posterUrl={state.activeStreamSession?.posterUrl || state.activeStreamSession?.backdropUrl}
      source={state.activeStreamSession?.source}
      effectiveIsPlaying={state.effectiveIsPlaying}
      effectiveIsMuted={state.effectiveIsMuted}
      effectiveVolume={state.effectiveVolume}
      effectiveCurrentTime={state.effectiveCurrentTime}
      effectiveDuration={state.effectiveDuration}
      effectiveIsTheater={state.effectiveIsTheater}
      isZoomedOut={state.isZoomedOut}
      isFullscreen={state.controls.isFullscreen}
      isBuffering={state.isBuffering}
      showVolumeSlider={state.controls.showVolumeSlider}
      volumeContainerRef={state.controls.volumeContainerRef}
      showQualityMenu={state.controls.showQualityMenu}
      currentQuality={state.currentQuality}
      availableQualities={state.availableQualities}
      activeLevelHeight={state.activeLevelHeight ?? undefined}
      audioTracks={state.audioTracks}
      activeAudio={state.activeAudio}
      showAudioMenu={state.controls.showAudioMenu}
      setShowAudioMenu={state.controls.setShowAudioMenu}
      onSelectAudioTrack={state.setActiveAudio}
      subtitles={state.subtitles}
      activeSubtitle={state.activeSubtitle}
      showSubtitleMenu={state.controls.showSubtitleMenu}
      setShowSubtitleMenu={state.controls.setShowSubtitleMenu}
      onSelectSubtitleTrack={state.setActiveSubtitle}
      isOverallPip={state.isOverallPip}
      progressPercent={state.progressPercent}
      bufferedPercent={state.bufferedPercent}
      isDraggingProgress={state.controls.isDraggingProgress}
      progressBarRef={state.controls.progressBarRef}
      onProgressMouseDown={state.controls.handleProgressMouseDown}
      onTogglePlay={state.controls.handleTogglePlay}
      onSeekRelative={state.controls.handleSeekRelative}
      onToggleMute={state.controls.handleToggleMute}
      onVolumeChange={state.controls.handleVolumeChange}
      setShowVolumeSlider={state.controls.setShowVolumeSlider}
      onToggleZoom={state.controls.toggleZoom}
      setShowQualityMenu={state.controls.setShowQualityMenu}
      onSelectQuality={(id) => {
        state.setQuality(id)
        state.controls.setShowQualityMenu(false)
      }}
      onToggleInAppPip={state.streamPlayer.toggleInAppPip}
      onToggleOverallPip={state.streamPlayer.toggleOverallPip}
      onToggleTheater={state.controls.toggleTheater}
      onToggleFullscreen={state.controls.toggleFullscreen}
      hasQueue={hasQueue}
      queueCount={state.queue?.length ?? 0}
      showQueue={showQueue}
      onToggleQueue={() => setShowQueue((prev) => !prev)}
    />
  )

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={state.containerRef}
        className={cn(
          'fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-md border-0',
          state.controls.isFullscreen || state.effectiveIsTheater ? 'p-0' : 'p-2 sm:p-4',
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: state.isVisible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={state.controls.handleClose}
      >
        <motion.div
          className={cn(
            'relative flex transition-colors duration-300 ease-out',
            state.controls.isFullscreen
              ? 'w-full h-full rounded-none flex-col gap-0'
              : state.effectiveIsTheater
              ? 'w-full h-full max-w-none px-0 flex-col gap-0'
              : hasQueue && showQueue
              ? 'w-full max-w-7xl 2xl:max-w-[1440px] px-2 sm:px-4 flex flex-col xl:flex-row items-center xl:items-start justify-center gap-4 sm:gap-6'
              : 'w-full max-w-5xl px-4 flex-col gap-2.5',
          )}
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: state.isVisible ? 1 : 0.94, opacity: state.isVisible ? 1 : 0, y: state.isVisible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={state.controls.handleMouseMove}
          onMouseLeave={state.controls.handleMouseLeave}
        >
          {/* Main Video & Controls Column */}
          <div
            className={cn(
              'relative flex flex-col transition-all duration-300 ease-out',
              !state.controls.isFullscreen && !state.effectiveIsTheater && hasQueue && showQueue
                ? 'flex-1 min-w-0 w-full max-w-5xl gap-2.5'
                : state.controls.isFullscreen || state.effectiveIsTheater
                ? 'w-full h-full gap-0'
                : 'w-full gap-2.5',
            )}
          >
            {/* EXTERNAL MODE: Title header rendered above video when space allows */}
          {state.hasExternalSpace && !state.controls.isFullscreen && !state.effectiveIsTheater && (
            <motion.div
              initial={false}
              animate={{
                opacity: state.controls.controlsVisible ? 1 : 0,
                y: state.controls.controlsVisible ? 0 : -8,
              }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'}
            >
              <PlayerHeader
                title={state.effectiveTitle}
                source={state.activeStreamSession?.source}
                isTrailer={state.isTrailer}
                isTheater={state.effectiveIsTheater}
                onClose={state.controls.handleClose}
              />
            </motion.div>
          )}

          {/* Dynamic Aspect Ratio Video Canvas Container */}
          <div
            className={cn(
              'relative w-full overflow-hidden bg-black shadow-2xl select-none border-0 transition-[aspect-ratio] duration-200',
              state.controls.isFullscreen || state.effectiveIsTheater
                ? 'rounded-none h-full'
                : 'rounded-3xl sm:rounded-[32px]',
              state.controls.controlsVisible ? 'cursor-default' : 'cursor-none',
            )}
            style={{
              aspectRatio:
                state.controls.isFullscreen || state.effectiveIsTheater ? undefined : state.currentAspectRatio,
              maxHeight: state.maxVideoHeight,
            }}
          >
            {/* OVERLAY MODE: Top vignette & Title rendered inside when space constrained/fullscreen/theater */}
            {(!state.hasExternalSpace || state.controls.isFullscreen || state.effectiveIsTheater) && (
              <>
                <motion.div
                  animate={{ opacity: state.controls.controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    'absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/85 via-black/35 to-transparent pointer-events-none z-10',
                    state.controls.isFullscreen || state.effectiveIsTheater
                      ? 'rounded-none'
                      : 'rounded-t-3xl sm:rounded-t-[32px]',
                  )}
                />
                <motion.div
                  initial={false}
                  animate={{
                    opacity: state.controls.controlsVisible ? 1 : 0,
                    y: state.controls.controlsVisible ? 0 : -8,
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`absolute top-4 left-4 right-4 z-20 ${
                    state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  <PlayerHeader
                    title={state.effectiveTitle}
                    source={state.activeStreamSession?.source}
                    isTrailer={state.isTrailer}
                    isTheater={state.effectiveIsTheater}
                    onClose={state.controls.handleClose}
                  />
                </motion.div>
              </>
            )}

            {/* Video or YouTube surface */}
            <PlayerVideoSurface
              isTrailer={state.isTrailer}
              embedBlocked={state.engine.embedBlocked}
              cleanYoutubeId={state.engine.cleanYoutubeId}
              youtubeId={props.youtubeId}
              propTitle={props.title}
              iframeRef={state.engine.iframeRef}
              iframeSrc={state.engine.iframeSrc}
              onIframeLoad={state.engine.handleIframeLoad}
              isZoomedOut={state.isZoomedOut}
              videoRef={state.engine.setVideoRef}
              activeSubtitle={state.activeSubtitle}
              onLoadedMetadata={() => {
                state.engine.handleLoadedVideoMetadata()
                state.engine.applyInitialSeek()
              }}
              onCanPlay={() => {
                state.engine.handleLoadedVideoMetadata()
                state.engine.applyInitialSeek()
              }}
              onTimeUpdate={() => {
                if (state.engine.videoRef.current && !state.controls.isDraggingProgress) {
                  state.onTimeUpdate(
                    state.engine.videoRef.current.currentTime,
                    state.engine.videoRef.current.duration || state.streamDuration,
                  )
                }
              }}
              onProgress={() => {
                if (state.engine.videoRef.current && state.engine.videoRef.current.buffered.length > 0) {
                  const bufferedEnd = state.engine.videoRef.current.buffered.end(
                    state.engine.videoRef.current.buffered.length - 1,
                  )
                  state.onBufferedUpdate(bufferedEnd)
                }
              }}
              onWaiting={() => state.onBuffering(true)}
              onPlaying={() => state.onBuffering(false)}
              onPlay={() => state.streamPlayer.onPlay?.()}
              onPause={() => state.streamPlayer.onPause?.()}
              onError={() => {
                if (state.playbackMethod === 'direct-play') {
                  state.fallbackToHls()
                } else {
                  state.onStreamError('Video playback error encountered')
                }
              }}
              onEnded={() => state.streamPlayer.onVideoEnded?.()}
              splashAction={state.controls.splashAction}
              onTogglePlay={state.controls.handleTogglePlay}
              onDoubleTap={state.isTrailer ? state.controls.toggleZoom : state.controls.toggleFullscreen}
              effectiveIsPlaying={state.effectiveIsPlaying}
              isBuffering={state.isBuffering}
            />

            {/* Bottom vignette in theater or fullscreen mode when controls are visible */}
            {(state.controls.isFullscreen || state.effectiveIsTheater) && (
              <motion.div
                animate={{ opacity: state.controls.controlsVisible ? 1 : 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10 rounded-none"
              />
            )}

            {/* In Fullscreen mode: render controls inside the video surface */}
            {state.controls.isFullscreen && (
              <motion.div
                initial={false}
                animate={{
                  opacity: state.controls.controlsVisible ? 1 : 0,
                  y: state.controls.controlsVisible ? 0 : 14,
                }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={cn(
                  'absolute bottom-3 sm:bottom-4 inset-x-2 sm:inset-x-6 z-20 flex justify-center w-[calc(100%-1rem)] sm:w-[calc(100%-3rem)] max-w-6xl xl:max-w-7xl 2xl:max-w-[1536px] 3xl:max-w-[1800px] mx-auto',
                  state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
                )}
              >
                {controlsBar}
              </motion.div>
            )}
          </div>

          {/* MODAL WINDOW MODE: Docked cleanly outside underneath the video container */}
          {!state.controls.isFullscreen && !state.effectiveIsTheater && (
            <motion.div
              initial={false}
              animate={{
                opacity: state.controls.controlsVisible ? 1 : 0,
                y: state.controls.controlsVisible ? 0 : 8,
              }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn(
                'w-full flex justify-center z-20 transition-opacity duration-200 mt-2 sm:mt-2.5 px-0',
                state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
              )}
            >
              {controlsBar}
            </motion.div>
          )}

          {/* THEATER MODE: Sticky to bottom of viewport, expansive widescreen architecture */}
          {!state.controls.isFullscreen && state.effectiveIsTheater && (
            <motion.div
              initial={false}
              animate={{
                opacity: state.controls.controlsVisible ? 1 : 0,
                y: state.controls.controlsVisible ? 0 : 16,
              }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center gap-2 sm:gap-2.5 w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-6xl xl:max-w-7xl 2xl:max-w-[1536px] 3xl:max-w-[1800px] select-none transition-opacity duration-200',
                state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
              )}
            >
              {controlsBar}
            </motion.div>
          )}
          </div>

          {/* Queue Side Column in Standard Modal Mode */}
          {!state.controls.isFullscreen && !state.effectiveIsTheater && hasQueue && showQueue && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full xl:w-80 2xl:w-96 shrink-0 flex flex-col xl:self-stretch min-h-0 xl:max-h-[min(82vh,720px)] mt-2 xl:mt-0"
            >
              <PlayerQueuePanel
                queue={state.queue}
                onPlayItem={(index) => void state.skipToIndex(index)}
                onRemoveItem={(index) => state.removeFromQueue(index)}
                onClearQueue={state.clearQueue}
                onClose={() => setShowQueue(false)}
                className="h-full"
              />
            </motion.div>
          )}
        </motion.div>

        {/* Floating Queue Drawer in Theater / Fullscreen Mode */}
        <AnimatePresence>
          {(state.effectiveIsTheater || state.controls.isFullscreen) && hasQueue && showQueue && (
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', damping: 25, stiffness: 260 }}
              className="fixed right-4 sm:right-6 top-16 sm:top-20 bottom-24 w-80 2xl:w-96 z-40 flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <PlayerQueuePanel
                queue={state.queue}
                onPlayItem={(index) => void state.skipToIndex(index)}
                onRemoveItem={(index) => state.removeFromQueue(index)}
                onClearQueue={state.clearQueue}
                onClose={() => setShowQueue(false)}
                className="h-full shadow-2xl bg-black/75 backdrop-blur-3xl"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <PlayerShortcutsModal
          isOpen={state.controls.showShortcutsModal}
          isTrailer={state.isTrailer}
          onClose={() => state.controls.setShowShortcutsModal(false)}
        />
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
