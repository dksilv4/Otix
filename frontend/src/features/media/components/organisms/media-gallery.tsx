import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useModal } from '@/lib/modals'
import {
  allMediaVideos,
  formatVideoTypeLabel,
  type MediaVideoLike,
} from '../../utils'
import type { MediaAssetOut } from '../../queries/media-queries'
import { TrailerVideoModal } from '@/features/discover/components/molecules/trailer-video-modal'
import { MediaScreenshotLightboxModal } from '../molecules/media-screenshot-lightbox-modal'

interface MediaGalleryProps {
  videos?: MediaVideoLike[]
  screenshots?: MediaAssetOut[]
  title?: string
  className?: string
}

type GalleryTab = 'all' | 'videos' | 'screenshots'

export const MediaGallery = ({
  videos = [],
  screenshots = [],
  title = 'Media',
  className = '',
}: MediaGalleryProps) => {
  const { openModal } = useModal()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const parsedVideos = allMediaVideos({ videos })
  const validScreenshots = (Array.isArray(screenshots) ? screenshots : []).filter(
    (s) => Boolean(s?.url),
  )

  const hasVideos = parsedVideos.length > 0
  const hasScreenshots = validScreenshots.length > 0

  const [activeTab, setActiveTab] = useState<GalleryTab>('all')

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, activeTab])

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (!hasVideos && !hasScreenshots) return null

  const handleOpenVideo = (youtubeId: string, videoType?: string | null) => {
    const videoTitle = title ? `${title} — ${formatVideoTypeLabel(videoType)}` : 'Trailer'
    const close = openModal(
      <TrailerVideoModal
        youtubeId={youtubeId}
        title={videoTitle}
        onClose={() => close()}
      />,
    )
  }

  const handleOpenScreenshot = (idx: number) => {
    const close = openModal(
      <MediaScreenshotLightboxModal
        screenshots={validScreenshots}
        initialIndex={idx}
        onClose={() => close()}
      />,
    )
  }

  const showTabs = hasVideos && hasScreenshots

  return (
    <section
      id="media-gallery-section"
      className={cn('glass-card py-6 sm:py-7 space-y-4 overflow-visible', className)}
    >
      {/* ── Header with Category Tabs & Nav Chevrons ── */}
      <div className="px-6 sm:px-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
          <h2 className="text-base font-semibold tracking-tight">Media Gallery</h2>
          <span className="text-xs text-muted-foreground font-medium">
            ({parsedVideos.length + validScreenshots.length})
          </span>
        </div>

        {/* Tab Pills & Scroll Arrows */}
        <div className="flex items-center gap-3">
          {showTabs && (
            <div className="flex items-center gap-1 rounded-xl bg-[var(--dk-surface-glass)] p-0.5 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all')
                  if (scrollRef.current) scrollRef.current.scrollLeft = 0
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === 'all'
                    ? 'bg-[var(--dk-surface-base)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('videos')
                  if (scrollRef.current) scrollRef.current.scrollLeft = 0
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === 'videos'
                    ? 'bg-[var(--dk-surface-base)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Videos ({parsedVideos.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('screenshots')
                  if (scrollRef.current) scrollRef.current.scrollLeft = 0
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === 'screenshots'
                    ? 'bg-[var(--dk-surface-base)] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Screenshots ({validScreenshots.length})
              </button>
            </div>
          )}

          {/* Desktop Chevron Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-320)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-base)] text-foreground disabled:opacity-25 transition-all"
              aria-label="Scroll media left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => scrollBy(320)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-base)] text-foreground disabled:opacity-25 transition-all"
              aria-label="Scroll media right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Horizontal Carousel Track (Full-Bleed Across Card, No Padding Clipping, No Masking) ── */}
      <div
        ref={scrollRef}
        className="flex gap-3.5 overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-none px-6 sm:px-7 py-3.5 -my-2.5 [mask-image:none] [-webkit-mask-image:none]"
        style={{ scrollPaddingInline: '1.5rem' }}
        aria-label="Media items"
      >
        {/* Videos */}
        {(activeTab === 'all' || activeTab === 'videos') &&
          parsedVideos.map((video) => {
            const thumbUrl = `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
            const label = formatVideoTypeLabel(video.videoType)
            return (
              <div
                key={video.youtubeId}
                onClick={() => handleOpenVideo(video.youtubeId, video.videoType)}
                className="group relative aspect-video w-64 sm:w-72 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-black/40 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
              >
                <img
                  src={thumbUrl}
                  alt={`${title} - ${label}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 transition-opacity group-hover:opacity-90" />

                {/* Center Play Button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-md transition-all duration-200 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Bottom Badge */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between">
                  <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur-md shadow-sm">
                    {label}
                  </span>
                </div>
              </div>
            )
          })}

        {/* Screenshots */}
        {(activeTab === 'all' || activeTab === 'screenshots') &&
          validScreenshots.map((shot, idx) => (
            <div
              key={shot.id || shot.url}
              onClick={() => handleOpenScreenshot(idx)}
              className="group relative aspect-video w-64 sm:w-72 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-black/40 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            >
              <img
                src={shot.url}
                alt={`${title} screenshot ${idx + 1}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />

              {/* Hover Zoom Icon */}
              <div className="absolute bottom-2.5 right-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-foreground backdrop-blur-md shadow-sm">
                  <Maximize2 className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          ))}
      </div>
    </section>
  )
}
