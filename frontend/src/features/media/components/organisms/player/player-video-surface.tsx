import type { RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clapperboard, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PlayerVideoSurfaceProps {
  isTrailer: boolean
  embedBlocked: boolean
  cleanYoutubeId?: string
  youtubeId?: string
  propTitle?: string
  iframeRef: RefObject<HTMLIFrameElement | null>
  iframeSrc: string
  onIframeLoad: () => void
  isZoomedOut: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  activeSubtitle?: {
    url?: string
    label?: string
    language?: string
  } | null
  onLoadedMetadata: () => void
  onCanPlay: () => void
  onTimeUpdate: () => void
  onProgress: () => void
  onWaiting: () => void
  onPlaying: () => void
  onError: () => void
  splashAction: 'play' | 'pause' | null
  onTogglePlay: () => void
  onDoubleTap: () => void
  effectiveIsPlaying: boolean
}

export const PlayerVideoSurface = ({
  isTrailer,
  embedBlocked,
  cleanYoutubeId,
  youtubeId,
  propTitle,
  iframeRef,
  iframeSrc,
  onIframeLoad,
  isZoomedOut,
  videoRef,
  activeSubtitle,
  onLoadedMetadata,
  onCanPlay,
  onTimeUpdate,
  onProgress,
  onWaiting,
  onPlaying,
  onError,
  splashAction,
  onTogglePlay,
  onDoubleTap,
  effectiveIsPlaying,
}: PlayerVideoSurfaceProps) => {
  return (
    <>
      {/* TRAILER ENGINE: YouTube Embed Iframe or Blocked Fallback Card */}
      {isTrailer ? (
        embedBlocked ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-black/80 backdrop-blur-md">
            <div className="max-w-md p-6 rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-2xl flex flex-col items-center gap-4 border-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clapperboard className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-primary-foreground">Trailer Playback Restricted</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  The video publisher has restricted third-party embedded playback for this trailer.
                </p>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${cleanYoutubeId || youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-medium text-xs sm:text-sm shadow-md hover:opacity-90 transition-opacity"
              >
                Watch on YouTube ↗
              </a>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={propTitle ? `${propTitle} trailer` : 'Trailer'}
            onLoad={onIframeLoad}
            frameBorder="0"
            className={cn(
              'w-full h-full origin-center transition-transform duration-300 ease-out pointer-events-none border-0',
              isZoomedOut ? 'scale-100' : 'scale-[1.35]'
            )}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )
      ) : (
        /* STREAM ENGINE: HTML5 / HLS Video Element */
        <video
          ref={videoRef}
          playsInline
          disablePictureInPicture={false}
          className="w-full h-full object-contain"
          onLoadedMetadata={onLoadedMetadata}
          onCanPlay={onCanPlay}
          onTimeUpdate={onTimeUpdate}
          onProgress={onProgress}
          onWaiting={onWaiting}
          onPlaying={onPlaying}
          onError={onError}
        >
          {activeSubtitle?.url && (
            <track
              kind="subtitles"
              src={activeSubtitle.url}
              label={activeSubtitle.label || 'Subtitles'}
              srcLang={
                activeSubtitle.language && activeSubtitle.language !== 'und'
                  ? activeSubtitle.language
                  : 'en'
              }
              default
            />
          )}
        </video>
      )}

      {/* Click-to-Play/Pause interactive gesture overlay */}
      <div
        className="absolute inset-0 cursor-pointer z-10 flex items-center justify-center border-0"
        onClick={onTogglePlay}
        onDoubleClick={onDoubleTap}
        aria-label={effectiveIsPlaying ? 'Pause video' : 'Play video'}
        role="button"
        tabIndex={-1}
      >
        {/* Play/Pause center splash feedback animation */}
        <AnimatePresence>
          {splashAction && (
            <motion.div
              key={splashAction}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.35 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-black/65 backdrop-blur-md text-primary-foreground shadow-2xl pointer-events-none border-0"
            >
              {splashAction === 'play' ? (
                <Play className="h-8 w-8 sm:h-10 sm:w-10 fill-current ml-1 text-primary-foreground" />
              ) : (
                <Pause className="h-8 w-8 sm:h-10 sm:w-10 fill-current text-primary-foreground" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
