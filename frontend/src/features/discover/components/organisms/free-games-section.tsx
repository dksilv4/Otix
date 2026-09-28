import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Gamepad2,
  ExternalLink,
  Gift,
  Clock,
  AlertCircle,
  Timer,
  ChevronRight,
} from 'lucide-react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import { Carousel } from '@ui/molecules/carousel'
import { MediaCard } from '@ui/molecules/media-card'
import { MediaLogo } from '@/lib/media/media-logo'
import { discoverQueries, type FreeGameItem } from '@/features/discover/queries/discover-queries'
import { cn } from '@/lib/utils'
import './free-games-section.scss'

// ── Helpers ────────────────────────────────────────────────────────────

function StoreIcon({ store, className }: { store: string; className?: string }) {
  switch (store) {
    case 'epic':
      return <EpicIcon className={className} />
    case 'steam':
      return <SteamIcon className={className} />
    default:
      return <Gamepad2 className={className} />
  }
}

const STORE_LABELS: Record<string, string> = {
  epic: 'Epic Games',
  steam: 'Steam',
}

function storeLabel(store: string, storeName?: string | null): string {
  return STORE_LABELS[store] || storeName || store
}

function formatTimeRemaining(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff <= 0) return 'Ending soon'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 1) return `${days}d ${hours}h left`
  if (days === 1) return `1d ${hours}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  if (mins > 0) return `${mins}m left`
  return 'Ending soon'
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Returns true when the game ends within 48 hours. */
function isEndingSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const diff = new Date(dateStr).getTime() - Date.now()
  return diff > 0 && diff < 48 * 60 * 60 * 1000
}

// ── Countdown hook (re-renders every minute) ──────────────────────────

function useCountdown(dateStr: string | null | undefined): string | null {
  const [label, setLabel] = useState(() => formatTimeRemaining(dateStr))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLabel(formatTimeRemaining(dateStr))
    if (!dateStr) return
    intervalRef.current = setInterval(() => {
      setLabel(formatTimeRemaining(dateStr))
    }, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [dateStr])

  return label
}

// ── Main Section ──────────────────────────────────────────────────────

export function FreeGamesSection() {
  const { data, isLoading, error } = useQuery(discoverQueries.freeGames())

  // ── Loading ──
  if (isLoading) {
    return (
      <motion.section
        id="discover-free-games"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
      >
        {/* Skeleton header */}
        <div className="px-8 flex items-center gap-3 mb-4">
          <div className="h-6 w-48 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-white/5 animate-pulse" />
        </div>
        {/* Skeleton featured area with bleed effect */}
        <div className="relative">
          <div className="mx-8 h-[300px] sm:h-[360px] rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
        {/* Skeleton carousel */}
        <div className="flex gap-3 px-8 mt-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[250px] aspect-[2/3] rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </motion.section>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <motion.section
        id="discover-free-games"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="px-8"
      >
        <div className="flex items-center gap-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load free games{error instanceof Error ? `: ${error.message}` : ''}</span>
        </div>
      </motion.section>
    )
  }

  const currentItems = data?.current || []
  const upcomingItems = data?.upcoming || []
  // Free now first, then coming soon — single rail, no tabs.
  const allItems = [...currentItems, ...upcomingItems]

  if (allItems.length === 0) {
    return null
  }

  const [featured, ...rest] = allItems

  return (
    <motion.section
      id="discover-free-games"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ═══ Header ═══ */}
      <div className="px-8 flex items-center gap-2.5 flex-wrap mb-4">
        <h2 className="text-xl font-bold text-white/90">Free Games</h2>
        {currentItems.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {currentItems.length} Free Now
          </span>
        )}
      </div>

      {/* ── Featured Spotlight + Carousel ── */}
      {featured && (
        <div className="relative">
          <div
            className="absolute inset-0 -bottom-16 overflow-hidden pointer-events-none"
            aria-hidden
          >
            {(featured.backdropUrl || featured.posterUrl) && (
              <img
                src={featured.backdropUrl || featured.posterUrl || ''}
                alt=""
                className="w-full h-full object-cover object-top opacity-[0.08] blur-sm"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--dk-bg,#09090b)] via-transparent to-[var(--dk-bg,#09090b)]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--dk-bg,#09090b)] via-transparent to-[var(--dk-bg,#09090b)]" />
          </div>

          <div className="relative z-10 px-8">
            <SpotlightCard item={featured} />
          </div>

          {rest.length > 0 && (
            <div className="relative z-10 mt-4">
              <Carousel
                minItemWidth={250}
                gap={12}
                showArrows
                trackPaddingInline="32px"
              >
                {rest.map((item) => (
                  <FreeGameCard key={`${item.store}:${item.id}`} item={item} />
                ))}
              </Carousel>
            </div>
          )}
        </div>
      )}
    </motion.section>
  )
}

// ── Spotlight Card (Featured, Large — Borderless) ─────────────────────

function SpotlightCard({ item }: { item: FreeGameItem }) {
  const isNow = item.isFreeNow
  const countdown = useCountdown(item.endDate)
  const ending = isEndingSoon(item.endDate)
  const media = item.mediaItem
  const imageUrl =
    media?.backdropUrl || item.backdropUrl || media?.posterUrl || item.posterUrl
  const logoUrl = media?.logoUrl || item.logoUrl
  const logoColorGuess = media?.logoColorGuess ?? null
  const title = media?.title || item.title
  const description = item.description
  const accentStyle = {
    '--free-accent': 'var(--primary)',
  } as CSSProperties

  return (
    <div className="group relative rounded-2xl overflow-hidden">
      <div className="relative flex flex-col sm:flex-row sm:min-h-[440px]">
        {/* ── Image area ── */}
        <div
          className="dk-free-spotlight__media relative sm:w-1/2 lg:w-[55%] min-h-[300px] aspect-[16/10] sm:aspect-auto sm:min-h-[440px] overflow-hidden"
          style={accentStyle}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="dk-free-spotlight__cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
              <Gamepad2 className="h-12 w-12 text-white/10" />
            </div>
          )}

          {imageUrl ? <div className="dk-free-spotlight__wash" aria-hidden /> : null}

          <div className="dk-free-spotlight__sweep-wrap" aria-hidden>
            <div className="dk-free-spotlight__sweep" />
          </div>

          {/* Gradient overlays — seamless edge fade */}
          <div className="absolute inset-0 z-[1] bg-gradient-to-r from-transparent via-transparent to-[var(--dk-bg,#09090b)] hidden sm:block" />
          <div className="absolute inset-0 z-[1] bg-gradient-to-t from-[var(--dk-bg,#09090b)] via-transparent to-transparent sm:hidden" />
          <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Logo over cover */}
          {logoUrl && (
            <div className="dk-free-spotlight__logo-wrap">
              <div className="dk-free-spotlight__logo-scrim" />
              <div className="dk-free-spotlight__logo-frame">
                <MediaLogo
                  src={logoUrl}
                  alt={title}
                  className="dk-free-spotlight__logo"
                  colorGuess={logoColorGuess}
                  background="dark"
                  shadow="drop-shadow(0 2px 4px rgb(0 0 0 / 0.95)) drop-shadow(0 8px 24px rgb(0 0 0 / 0.75))"
                />
              </div>
            </div>
          )}

          {/* Top left — status badge */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            {isNow ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-emerald-500 text-black shadow-lg shadow-emerald-500/30">
                <Gift className="h-3 w-3" />
                100% OFF
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-sky-500/90 text-white shadow-lg shadow-sky-500/30">
                <Clock className="h-3 w-3" />
                Coming Soon
              </span>
            )}
            {ending && countdown && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/90 text-black shadow-lg shadow-amber-500/30 animate-pulse">
                <Timer className="h-3 w-3" />
                {countdown}
              </span>
            )}
          </div>

          {/* Top right — store badge */}
          <div className="absolute top-3 right-3 z-10 sm:hidden">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium bg-black/50 text-white/80 backdrop-blur-md border border-white/10">
              <StoreIcon store={item.store} className="h-3 w-3" />
              {storeLabel(item.store, item.storeName)}
            </span>
          </div>
        </div>

        {/* ── Info area ── */}
        <div className="relative sm:w-1/2 lg:w-[45%] flex flex-col justify-center p-5 sm:p-6 lg:p-8">
          {/* Store badge (desktop) */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-white/40 mb-3">
            <StoreIcon store={item.store} className="h-3.5 w-3.5" />
            {storeLabel(item.store, item.storeName)}
          </div>

          {/* Title */}
          <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight line-clamp-2 mb-2">
            {title}
          </h3>

          {/* Description */}
          {description && (
            <p className="text-sm text-white/45 line-clamp-2 leading-relaxed mb-4">
              {description}
            </p>
          )}

          {/* Countdown bar */}
          {isNow && countdown && !ending && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 mb-3">
              <Clock className="h-3 w-3" />
              {countdown} · Ends {formatDate(item.endDate)}
            </div>
          )}
          {!isNow && item.startDate && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-400/70 mb-3">
              <Clock className="h-3 w-3" />
              Unlocks {formatDate(item.startDate)}
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-3 mb-5">
            {item.originalPrice && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/25 line-through">{item.originalPrice}</span>
                <span className="text-sm font-bold text-emerald-400">FREE</span>
              </div>
            )}
            {!item.originalPrice && (
              <span className="text-sm font-bold text-emerald-400">FREE</span>
            )}
          </div>

          {/* CTA buttons — Otix first when matched; claim is secondary */}
          <div className="flex flex-wrap items-center gap-2.5">
            {item.matched && media ? (
              <Link
                to="/media/$mediaType/$mediaId"
                params={{ mediaType: 'game', mediaId: String(media.id) }}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-md transition-all active:scale-[0.97] hover:opacity-95"
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                Open in Otix
                <ChevronRight className="h-3 w-3 -mr-0.5" />
              </Link>
            ) : null}
            {item.claimUrl && (
              <a
                href={item.claimUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]',
                  item.matched && media
                    ? 'text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08]'
                    : isNow
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20 font-bold'
                      : 'bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-500/20 font-bold',
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isNow
                  ? `Claim on ${storeLabel(item.store, item.storeName)}`
                  : `View on ${storeLabel(item.store, item.storeName)}`}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Free Game Card (always MediaCard; catalog data when matched) ───────

function FreeGameCard({ item }: { item: FreeGameItem }) {
  const isNow = item.isFreeNow
  const countdown = useCountdown(item.endDate)
  const ending = isEndingSoon(item.endDate)
  const media = item.mediaItem
  const hasMatch = Boolean(item.matched && media)
  const subtitle = item.originalPrice ? `FREE · ${item.originalPrice}` : 'FREE'
  const claimLabel = isNow ? 'Claim' : 'Preview'
  const posterUrl = media?.posterUrl || item.posterUrl || null
  const textlessPosterUrl = media?.textlessPosterUrl || null
  const backdropUrl = media?.backdropUrl || item.backdropUrl || null
  const logoUrl = media?.logoUrl || item.logoUrl || null
  // Logo mode only when we have a logo: prefer textless, else backdrop/poster.
  // Without a logo, leave cleanArt empty so MediaCard uses the portrait poster.
  const cleanArt = logoUrl
    ? textlessPosterUrl || backdropUrl || posterUrl
    : textlessPosterUrl

  return (
    <div className="group/free relative w-full">
      <MediaCard
        id={media?.id ?? item.id}
        mediaType="game"
        title={media?.title || item.title}
        posterUrl={posterUrl || backdropUrl}
        textlessPosterUrl={cleanArt}
        backdropUrl={undefined}
        logoUrl={logoUrl}
        logoColorGuess={media?.logoColorGuess}
        releaseDate={media?.releaseDate}
        avgRating={media?.avgRating}
        ratingCount={media?.ratingCount}
        showTypeBadge={false}
        tmdbId={media?.tmdbId}
        priority={false}
        zoomed={false}
        interactive={hasMatch}
        subtitle={subtitle}
      />

      {/* Overlay badges */}
      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 pointer-events-none">
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-md',
            isNow ? 'bg-emerald-500 text-black' : 'bg-sky-500/90 text-white',
          )}
        >
          <Gift className="h-2.5 w-2.5" />
          {isNow ? 'FREE' : 'SOON'}
        </span>
      </div>
      <div className="absolute top-2 right-2 z-20 pointer-events-none">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-black/50 text-white/70 backdrop-blur-md border border-white/10">
          <StoreIcon store={item.store} className="h-3 w-3" />
        </span>
      </div>
      {isNow && countdown && (
        <div className="absolute bottom-[72px] left-2 right-2 z-20 pointer-events-none">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-md border',
              ending
                ? 'bg-amber-500/90 text-black border-amber-400/30 animate-pulse'
                : 'bg-black/50 text-white/70 border-white/10',
            )}
          >
            <Timer className="h-2.5 w-2.5" />
            {countdown}
          </span>
        </div>
      )}
      {!isNow && item.startDate && (
        <div className="absolute bottom-[72px] left-2 right-2 z-20 pointer-events-none">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/50 text-white/60 backdrop-blur-md border border-white/10">
            Unlocks {formatDate(item.startDate)}
          </span>
        </div>
      )}

      {/* Claim — secondary control; card click opens Otix when matched */}
      {item.claimUrl && (
        <a
          href={item.claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`${claimLabel} on ${storeLabel(item.store, item.storeName)}`}
          aria-label={`${claimLabel} on ${storeLabel(item.store, item.storeName)}`}
          className={cn(
            'absolute bottom-2 right-2 z-30 inline-flex items-center gap-1 rounded-md px-2 py-1',
            'text-[10px] font-semibold shadow-md backdrop-blur-md border transition-opacity',
            'opacity-90 group-hover/free:opacity-100',
            isNow
              ? 'bg-emerald-500/90 text-black border-emerald-400/30'
              : 'bg-sky-500/90 text-white border-sky-400/30',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-2.5 w-2.5" />
          {claimLabel}
        </a>
      )}

      {/* Unmatched: whole-card claim hit target (no Otix detail page) */}
      {!hasMatch && item.claimUrl && (
        <a
          href={item.claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-10 rounded-lg"
          aria-label={`${claimLabel} on ${storeLabel(item.store, item.storeName)}`}
        />
      )}
    </div>
  )
}
