import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MediaPlayerInAppPipOverlay } from '../molecules/media-player-in-app-pip-overlay'
import { useUnifiedPlayerState } from '../../hooks/use-unified-player-state'
import { PlayerHeader } from './player/player-header'
import { PlayerScrubberBar } from './player/player-scrubber-bar'
import { PlayerControlsBar } from './player/player-controls-bar'
import { PlayerShortcutsModal } from './player/player-shortcuts-modal'
import { PlayerVideoSurface } from './player/player-video-surface'
import type { UnifiedMediaPlayerModalProps } from '../../types/unified-player'

export const UnifiedMediaPlayerModal = (props: UnifiedMediaPlayerModalProps = {}) => {
  const state = useUnifiedPlayerState(props)

  if (typeof document === 'undefined' || (!state.isVisible && !state.isInAppPip)) {
    return null
  }

  // In-app PiP mode render (stream mode)
  if (!state.isTrailer && state.isInAppPip) {
    return createPortal(
      <div className="fixed bottom-6 right-6 z-50 w-80 aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black border-0">
        <video
          ref={state.engine.videoRef}
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

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={state.containerRef}
        className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md border-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: state.isVisible ? 1 : 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={state.controls.handleClose}
      >
        <motion.div
          className={cn(
            'relative flex flex-col gap-2.5 transition-all duration-300 ease-out',
            state.controls.isFullscreen
              ? 'w-full h-full rounded-none'
              : state.effectiveIsTheater
              ? 'w-full max-w-none px-2 sm:px-6 md:px-8'
              : 'w-full max-w-5xl px-4',
          )}
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: state.isVisible ? 1 : 0.94, opacity: state.isVisible ? 1 : 0, y: state.isVisible ? 0 : 16 }}
          exit={{ scale: 0.94, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={state.controls.handleMouseMove}
          onMouseLeave={state.controls.handleMouseLeave}
        >
          {/* EXTERNAL MODE: Title header rendered above video when space allows */}
          {state.hasExternalSpace && !state.controls.isFullscreen && (
            <PlayerHeader
              title={state.effectiveTitle}
              source={state.activeStreamSession?.source}
              isTrailer={state.isTrailer}
              onClose={state.controls.handleClose}
            />
          )}

          {/* Dynamic Aspect Ratio Video Canvas Container */}
          <div
            className={cn(
              'relative w-full rounded-3xl sm:rounded-[32px] overflow-hidden bg-black shadow-2xl select-none border-0 transition-[aspect-ratio] duration-200',
              state.controls.controlsVisible ? 'cursor-default' : 'cursor-none',
            )}
            style={{
              aspectRatio: state.currentAspectRatio,
              maxHeight: state.maxVideoHeight,
            }}
          >
            {/* OVERLAY MODE: Top vignette & Title rendered inside when space is constrained or fullscreen */}
            {(!state.hasExternalSpace || state.controls.isFullscreen) && (
              <>
                <motion.div
                  animate={{ opacity: state.controls.controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/85 via-black/35 to-transparent pointer-events-none z-10 rounded-t-3xl sm:rounded-t-[32px]"
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
              videoRef={state.engine.videoRef}
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
              onError={() => {
                if (state.playbackMethod === 'direct-play') {
                  state.fallbackToHls()
                } else {
                  state.onStreamError('Video playback error encountered')
                }
              }}
              splashAction={state.controls.splashAction}
              onTogglePlay={state.controls.handleTogglePlay}
              onDoubleTap={state.isTrailer ? state.controls.toggleZoom : state.controls.toggleFullscreen}
              effectiveIsPlaying={state.effectiveIsPlaying}
            />

            {/* OVERLAY MODE: Bottom vignette & Controls */}
            {(!state.hasExternalSpace || state.controls.isFullscreen) && (
              <>
                <motion.div
                  animate={{ opacity: state.controls.controlsVisible ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10 rounded-b-3xl sm:rounded-b-[32px]"
                />
                <motion.div
                  initial={false}
                  animate={{
                    opacity: state.controls.controlsVisible ? 1 : 0,
                    y: state.controls.controlsVisible ? 0 : 10,
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={cn(
                    'absolute bottom-3 sm:bottom-4 inset-x-4 sm:inset-x-6 z-20 flex flex-col gap-2.5',
                    state.controls.controlsVisible ? 'pointer-events-auto' : 'pointer-events-none',
                  )}
                >
                  <PlayerScrubberBar
                    progressBarRef={state.controls.progressBarRef}
                    effectiveDuration={state.effectiveDuration}
                    effectiveCurrentTime={state.effectiveCurrentTime}
                    progressPercent={state.progressPercent}
                    bufferedPercent={state.bufferedPercent}
                    isDraggingProgress={state.controls.isDraggingProgress}
                    onMouseDown={state.controls.handleProgressMouseDown}
                  />
                  <PlayerControlsBar
                    isTrailer={state.isTrailer}
                    effectiveIsPlaying={state.effectiveIsPlaying}
                    effectiveIsMuted={state.effectiveIsMuted}
                    effectiveVolume={state.effectiveVolume}
                    effectiveCurrentTime={state.effectiveCurrentTime}
                    effectiveDuration={state.effectiveDuration}
                    effectiveIsTheater={state.effectiveIsTheater}
                    isZoomedOut={state.isZoomedOut}
                    isFullscreen={state.controls.isFullscreen}
                    showVolumeSlider={state.controls.showVolumeSlider}
                    volumeContainerRef={state.controls.volumeContainerRef}
                    showQualityMenu={state.controls.showQualityMenu}
                    currentQuality={state.currentQuality}
                    availableQualities={state.availableQualities}
                    activeLevelHeight={state.activeLevelHeight ?? undefined}
                    isOverallPip={state.isOverallPip}
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
                  />
                </motion.div>
              </>
            )}
          </div>

          {/* EXTERNAL MODE: Controls rendered outside below video when viewport allows */}
          {state.hasExternalSpace && !state.controls.isFullscreen && (
            <div className="w-full flex flex-col gap-2.5 px-1 pointer-events-auto">
              <PlayerScrubberBar
                progressBarRef={state.controls.progressBarRef}
                effectiveDuration={state.effectiveDuration}
                effectiveCurrentTime={state.effectiveCurrentTime}
                progressPercent={state.progressPercent}
                bufferedPercent={state.bufferedPercent}
                isDraggingProgress={state.controls.isDraggingProgress}
                onMouseDown={state.controls.handleProgressMouseDown}
              />
              <PlayerControlsBar
                isTrailer={state.isTrailer}
                effectiveIsPlaying={state.effectiveIsPlaying}
                effectiveIsMuted={state.effectiveIsMuted}
                effectiveVolume={state.effectiveVolume}
                effectiveCurrentTime={state.effectiveCurrentTime}
                effectiveDuration={state.effectiveDuration}
                effectiveIsTheater={state.effectiveIsTheater}
                isZoomedOut={state.isZoomedOut}
                isFullscreen={state.controls.isFullscreen}
                showVolumeSlider={state.controls.showVolumeSlider}
                volumeContainerRef={state.controls.volumeContainerRef}
                showQualityMenu={state.controls.showQualityMenu}
                currentQuality={state.currentQuality}
                availableQualities={state.availableQualities}
                activeLevelHeight={state.activeLevelHeight ?? undefined}
                isOverallPip={state.isOverallPip}
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
              />
            </div>
          )}
        </motion.div>

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
