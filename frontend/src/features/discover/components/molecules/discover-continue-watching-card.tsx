import { memo, useMemo, useCallback } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Play, Loader2, MoreVertical } from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { useModal } from '@/lib/modals'
import {
  ContextMenuTrigger,
  useOptionalMenuContext,
  buildContinueWatchingMenuItems,
} from '@/features/_config/context-menu'
import type { DiscoverContinueWatchingItem } from '../../types'
import {
  formatContinueWatchingRemaining,
  getContinueWatchingSubtitle,
  getContinueWatchingArtwork,
} from '../../utils/continue-watching'

interface DiscoverContinueWatchingCardProps {
  item: DiscoverContinueWatchingItem
  isPlaying?: boolean
  onPlay: (item: DiscoverContinueWatchingItem) => void
}

export const DiscoverContinueWatchingCard = memo(
  ({ item, isPlaying = false, onPlay }: DiscoverContinueWatchingCardProps) => {
    const navigate = useNavigate()
    const { openModal } = useModal()
    const menu = useOptionalMenuContext()

    const artwork = getContinueWatchingArtwork(item)
    const subtitle = getContinueWatchingSubtitle(item)
    const remainingText = formatContinueWatchingRemaining(item.viewOffset, item.duration)
    const progressPercent = Math.min(100, Math.max(0, item.progressPercent ?? 0))
    const hasStarted = (item.viewOffset != null && item.viewOffset > 0) || progressPercent > 0

    const handlePlayClick = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onPlay(item)
    }

    const menuItems = useMemo(() => {
      return buildContinueWatchingMenuItems(
        {
          type: 'continue-watching',
          id: String(item.mediaItemId || item.ratingKey),
          ratingKey: item.ratingKey,
          grandparentRatingKey: item.grandparentRatingKey ?? undefined,
          mediaItemId: item.mediaItemId ? String(item.mediaItemId) : undefined,
          mediaType: item.mediaType,
          title: item.title,
          showTitle: item.showTitle ?? undefined,
          episodeTitle: item.episodeTitle ?? undefined,
          seasonNumber: item.seasonNumber ?? undefined,
          episodeNumber: item.episodeNumber ?? undefined,
          subtitle: subtitle ?? undefined,
          thumb: artwork || undefined,
          stillUrl: artwork || undefined,
          backdropUrl: item.backdropUrl ?? undefined,
          viewOffset: item.viewOffset,
          duration: item.duration,
          progressPercent: item.progressPercent,
          year: item.year ? String(item.year) : undefined,
          serverId: item.serverId,
          serverName: item.serverName,
          serverUrl: item.serverUrl,
        },
        { navigate, openModal },
        { onPlay },
      )
    }, [item, subtitle, artwork, navigate, openModal, onPlay])

    const handleMenuClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        menu?.open(e.nativeEvent, menuItems, {
          mediaType: item.mediaType,
          targetType: 'continue-watching',
          data: { itemId: item.id, ratingKey: item.ratingKey },
        })
      },
      [menu, menuItems, item.mediaType, item.id, item.ratingKey],
    )

    const cardContent = (
      <div
        data-testid="discover-continue-watching-card"
        data-context-type="continue-watching"
        data-rating-key={item.ratingKey}
        data-server-id={item.serverId ?? undefined}
        data-server-name={item.serverName ?? undefined}
        data-server-url={item.serverUrl ?? undefined}
        data-media-id={String(item.mediaItemId || item.ratingKey)}
        data-media-item-id={item.mediaItemId ? String(item.mediaItemId) : undefined}
        data-media-type={item.mediaType}
        data-media-title={item.title}
        data-show-title={item.showTitle ?? undefined}
        data-episode-title={item.episodeTitle ?? undefined}
        data-season-number={item.seasonNumber ?? undefined}
        data-episode-number={item.episodeNumber ?? undefined}
        data-subtitle={subtitle ?? undefined}
        data-media-poster={artwork || undefined}
        data-episode-still={artwork || undefined}
        data-backdrop-url={item.backdropUrl ?? undefined}
        data-view-offset={item.viewOffset ?? undefined}
        data-duration={item.duration ?? undefined}
        data-progress-percent={item.progressPercent ?? undefined}
        data-media-year={item.year ? String(item.year) : undefined}
        className="group relative flex flex-col w-full text-left select-none cursor-pointer"
      >
        {/* 16:9 Thumbnail Pod with Soft Glassmorphic Tonal Surface */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-card/60 shadow-md backdrop-blur-xl transition duration-300 group-hover:shadow-xl group-hover:-translate-y-0.5">
          {/* Edge-to-edge artwork */}
          <div className="absolute inset-0 scale-100 group-hover:scale-105 transition-transform duration-500">
            <DkImage
              src={artwork}
              alt={item.title}
              className="h-full w-full object-cover"
              fallback={item.title[0]}
            />
          </div>

          {/* Atmospheric Vignette Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

          {/* Top Row Badges: Episode index / Remaining duration / Options Button */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10 pointer-events-none">
            {item.mediaType === 'show' && item.seasonNumber != null && item.episodeNumber != null ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-foreground bg-background/60 backdrop-blur-xl shadow-sm">
                S{item.seasonNumber}:E{item.episodeNumber}
              </span>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1.5 pointer-events-auto">
              {remainingText && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium text-foreground/90 bg-background/60 backdrop-blur-xl shadow-sm">
                  {remainingText}
                </span>
              )}

              <button
                type="button"
                aria-label={`Options for ${item.title}`}
                data-testid="discover-continue-watching-options-btn"
                onClick={handleMenuClick}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-full bg-background/60 backdrop-blur-xl text-foreground hover:bg-background/80 hover:text-primary shadow-sm cursor-pointer"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Hover Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30 z-20 pointer-events-none">
            <button
              type="button"
              aria-label={`Continue watching ${item.title}`}
              onClick={handlePlayClick}
              disabled={isPlaying}
              className="pointer-events-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform cursor-pointer disabled:opacity-75"
            >
              {isPlaying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Floating Glassmorphic Progress Bar (only rendered when media has started) */}
          {hasStarted && (
            <div className="absolute bottom-3 inset-x-3 z-10 pointer-events-none">
              <div
                data-testid="discover-continue-watching-progress"
                className="h-2 w-full rounded-full bg-background/60 backdrop-blur-xl shadow-md overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-primary transition duration-500 shadow-[0_0_8px_var(--primary)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Text Metadata */}
        <div className="mt-2.5 px-0.5">
          <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {item.title}
          </h4>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    )

    const content = item.mediaItemId ? (
      <Link
        to="/media/$mediaType/$mediaId"
        params={{
          mediaType: item.mediaType,
          mediaId: String(item.mediaItemId),
        }}
        search={
          item.mediaType === 'show' && item.seasonNumber != null
            ? { season: item.seasonNumber }
            : undefined
        }
        className="block w-full focus-visible:outline-none"
      >
        {cardContent}
      </Link>
    ) : (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPlay(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPlay(item)
          }
        }}
        className="block w-full text-left focus-visible:outline-none"
      >
        {cardContent}
      </div>
    )

    return (
      <ContextMenuTrigger
        items={menuItems}
        mediaType={item.mediaType}
        data={{ itemId: item.id, ratingKey: item.ratingKey }}
      >
        {content}
      </ContextMenuTrigger>
    )
  },
)
