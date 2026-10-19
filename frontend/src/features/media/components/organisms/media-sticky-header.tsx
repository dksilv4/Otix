import { useState, useEffect, useRef, useCallback } from 'react'
import { Bookmark, CheckCircle2, Film, Heart, Star, Gift, ExternalLink } from 'lucide-react'
import { useAuth } from '@auth/hooks/use-auth'
import { useModal } from '@/lib/modals'
import { openSessionWindow } from '@/lib/utils/open-external'
import { showToast } from '@ui/molecules/toast'
import { useGameFreePromotions } from '@media/game/hooks/use-game-free-promotions'
import { TrailerVideoModal } from '@/features/discover/components/molecules/trailer-video-modal'
import { useToggleInteraction, useUserInteractions } from '@/features/interaction/interaction-queries'
import { showXPToast } from '@ui/atoms/xp-toast'
import type { MediaItemDetail } from '@media'
import { formatYear, primaryTrailer } from '@media'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { useNavPillsVisibility } from '@/features/navigation'
import { AddToListButton } from '@list'
import { cn } from '@/lib/utils'

interface MediaStickyHeaderProps {
  detail: MediaItemDetail
  mediaType: string
}

export type MediaStickyHeaderV4Props = MediaStickyHeaderProps

const MIN_BETWEEN_WIDTH = 460
const PILL_GAP = 12

export const MediaStickyHeader = ({ detail, mediaType }: MediaStickyHeaderProps) => {
  const [visible, setVisible] = useState(false)
  const [placement, setPlacement] = useState<'between' | 'below'>('between')
  const [bounds, setBounds] = useState<{ center: number; maxWidth: number } | null>(null)

  const { isAuthenticated } = useAuth()
  const { isDesktop } = useDesktopPlatform()
  const { showLeft, showRight } = useNavPillsVisibility()
  const { openModal } = useModal()
  const closeTrailerRef = useRef<(() => void) | null>(null)

  const { data: userInteractions } = useUserInteractions(mediaType, detail.id, {
    enabled: isAuthenticated,
  })
  const toggleInteraction = useToggleInteraction(mediaType, detail.id)
  const { activePromotion } = useGameFreePromotions(detail)

  // Scroll listener
  useEffect(() => {
    const onScroll = () => {
      const isScrolled = window.scrollY > 340
      setVisible(isScrolled)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Measure space between nav pills to determine whether to place in between or below
  const updatePlacement = useCallback(() => {
    if (typeof window === 'undefined') return

    const leftPill = document.querySelector('[data-nav-pill="left"]') as HTMLElement | null
    const rightPill = document.querySelector('[data-nav-pill="right"]') as HTMLElement | null

    const leftEdge = showLeft && leftPill
      ? leftPill.getBoundingClientRect().right + PILL_GAP
      : 16

    const rightEdge = showRight && rightPill
      ? rightPill.getBoundingClientRect().left - PILL_GAP
      : window.innerWidth - 16

    const availableSpace = rightEdge - leftEdge

    if (window.innerWidth >= 1024 && availableSpace >= MIN_BETWEEN_WIDTH) {
      setPlacement('between')
      setBounds({
        center: (leftEdge + rightEdge) / 2,
        maxWidth: availableSpace,
      })
    } else {
      setPlacement('below')
      setBounds(null)
    }
  }, [showLeft, showRight])

   
  useEffect(() => {
    updatePlacement()
    window.addEventListener('resize', updatePlacement, { passive: true })
    const interval = setInterval(updatePlacement, 1000)

    return () => {
      window.removeEventListener('resize', updatePlacement)
      clearInterval(interval)
    }
  }, [updatePlacement])
   

  const interactions = userInteractions ?? detail.userInteractions ?? {}
  const isLiked = Boolean(interactions.liked)
  const isWatchlisted = Boolean(interactions.watchlisted)
  const isWatched = Boolean(
    interactions.watched || interactions.played || interactions.listened,
  )

  const handleToggle = (type: 'liked' | 'watchlisted' | 'watched' | 'played' | 'listened') => {
    if (!isAuthenticated) return
    const active =
      type === 'liked' ? !isLiked : type === 'watchlisted' ? !isWatchlisted : !isWatched

    toggleInteraction.mutate({ type, active })
    if (active) {
      showXPToast(type === 'liked' || type === 'watchlisted' ? 10 : 30)
    }
  }

  const watchedType =
    mediaType === 'game' ? 'played' : mediaType === 'music' ? 'listened' : 'watched'
  const watchlistLabel = mediaType === 'game' || mediaType === 'music' ? 'Wishlist' : 'Watchlist'
  const watchedLabel =
    mediaType === 'game' ? 'Played' : mediaType === 'music' ? 'Listened' : 'Watched'

  const trailer = primaryTrailer(detail)
  const openTrailer = () => {
    if (!trailer) return
    closeTrailerRef.current?.()
    closeTrailerRef.current = openModal(
      <TrailerVideoModal
        youtubeId={trailer.youtubeId}
        title={detail.title}
        onClose={() => closeTrailerRef.current?.()}
      />,
    )
  }

  const year = formatYear(detail.releaseDate)

  // Position styles based on layout mode
  const getContainerStyles = (): React.CSSProperties => {
    const isBetween = placement === 'between' && bounds !== null

    if (isBetween) {
      return {
        top: isDesktop ? '3rem' : '1rem', // top-12 (desktop) or top-4 (web) matching nav pills
        left: `${bounds.center}px`,
        maxWidth: `${bounds.maxWidth}px`,
        transform: visible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -2rem) scale(0.96)',
        transition: 'all 300ms var(--dk-ease-out)',
        background: 'color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)',
        backgroundImage:
          'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
      }
    }

    // 'below' placement clears the nav pills completely
    return {
      top: isDesktop ? '6.5rem' : '4.25rem', // below the nav pills
      left: '50%',
      maxWidth: 'min(calc(100vw - 2rem), 48rem)',
      transform: visible
        ? 'translate(-50%, 0) scale(1)'
        : 'translate(-50%, -2rem) scale(0.96)',
      transition: 'all 300ms var(--dk-ease-out)',
      background: 'color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)',
      backgroundImage:
        'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
    }
  }

  return (
    <div
      data-testid="media-sticky-header"
      data-placement={placement}
      className={cn(
        'fixed z-[9990] flex items-center gap-2 sm:gap-3 rounded-[2rem] px-2.5 sm:px-3.5 py-1.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] border border-[var(--dk-separator)]',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      style={getContainerStyles()}
    >
      {/* ── Left: Poster thumbnail + Title + Year ── */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
        {detail.posterUrl && (
          <img
            src={detail.posterUrl}
            alt=""
            className="h-8 w-5 sm:h-8 sm:w-6 rounded-md object-cover border border-[var(--dk-separator)] shrink-0 shadow-sm"
          />
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="truncate text-xs sm:text-sm font-bold text-foreground tracking-tight">
            {detail.title}
          </h2>
          {year && (
            <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0 font-medium hidden sm:inline">
              ({year})
            </span>
          )}
        </div>
      </div>

      {/* ── Right Action Cluster: Otix Score + Primary Action + User Actions ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
        {/* Otix Score badge */}
        {detail.overallRating != null && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
            <Star className="h-3 w-3 fill-current" />
            <span>{Math.round(detail.overallRating)}%</span>
          </div>
        )}

        {/* Free Giveaway Claim Action */}
        {activePromotion && activePromotion.claimUrl && (
          <button
            type="button"
            onClick={() => {
              openSessionWindow(activePromotion.claimUrl!)
              showToast({
                title: 'Opening Store Page',
                description: `Claiming free copy on ${activePromotion.storeName}.`,
                variant: 'info',
              })
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground active:scale-95 px-3 py-1 text-[11px] sm:text-xs font-semibold shadow-md transition-all shrink-0"
            title={`Claim Free on ${activePromotion.storeName}`}
          >
            <Gift className="h-3.5 w-3.5 shrink-0" />
            <span>Free on {activePromotion.storeName}</span>
            <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
          </button>
        )}

        {/* Secondary Action: Trailer */}
        {trailer ? (
          <button
            type="button"
            onClick={openTrailer}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] active:scale-95 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold text-foreground shadow-sm transition-all shrink-0 group/trailer"
            title="Watch Trailer"
          >
            <Film className="h-3 w-3 text-primary group-hover/trailer:scale-110 transition-transform shrink-0" />
            <span>Trailer</span>
          </button>
        ) : null}

        {/* Watchlist / Wishlist Button */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => handleToggle('watchlisted')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1 text-xs font-medium transition-all shrink-0 active:scale-95',
              isWatchlisted
                ? 'bg-primary/20 text-primary'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-foreground',
            )}
            title={isWatchlisted ? `In ${watchlistLabel}` : `Add to ${watchlistLabel}`}
          >
            <Bookmark className={cn('h-3.5 w-3.5', isWatchlisted && 'fill-current text-primary')} />
            <span className={placement === 'between' ? 'hidden xl:inline' : 'hidden md:inline'}>
              {watchlistLabel}
            </span>
          </button>
        )}

        {/* Watched / Played Button */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => handleToggle(watchedType)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1 text-xs font-medium transition-all shrink-0 active:scale-95',
              isWatched
                ? 'bg-primary/20 text-primary'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-foreground',
            )}
            title={isWatched ? `Marked as ${watchedLabel}` : `Mark ${watchedLabel}`}
          >
            <CheckCircle2 className={cn('h-3.5 w-3.5', isWatched && 'text-primary')} />
            <span className={placement === 'between' ? 'hidden xl:inline' : 'hidden md:inline'}>
              {watchedLabel}
            </span>
          </button>
        )}

        {/* Like Button */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => handleToggle('liked')}
            className={cn(
              'inline-flex items-center justify-center rounded-full p-1.5 text-xs transition-all shrink-0 active:scale-95',
              isLiked
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] text-muted-foreground hover:text-foreground',
            )}
            title={isLiked ? 'Liked' : 'Like'}
          >
            <Heart className={cn('h-3.5 w-3.5', isLiked && 'fill-current text-rose-600 dark:text-rose-400')} />
          </button>
        )}

        {/* Add to List */}
        {isAuthenticated && (
          <AddToListButton mediaItemId={detail.id} variant="icon" />
        )}
      </div>
    </div>
  )
};

export { MediaStickyHeader as MediaStickyHeaderV4 }
