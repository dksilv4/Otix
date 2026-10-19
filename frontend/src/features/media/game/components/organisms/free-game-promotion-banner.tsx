import { useState } from 'react'
import {
  Gift,
  ExternalLink,
  Clock,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  Timer,
  Gamepad2,
} from 'lucide-react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import GOGIcon from '@/assets/provider-logos/gog.svg?react'
import { openSessionWindow } from '@/lib/utils/open-external'
import { showToast } from '@ui/molecules/toast'
import type { MediaItemDetail, FreePromotionItem } from '../../queries/media-queries'
import { useGameFreePromotions } from '../../hooks/use-game-free-promotions'
import { cn } from '@/lib/utils'

const StoreIcon = ({ store, className }: { store: string; className?: string }) => {
  switch (store.toLowerCase()) {
    case 'epic':
      return <EpicIcon className={className} />
    case 'steam':
      return <SteamIcon className={className} />
    case 'gog':
      return <GOGIcon className={className} />
    default:
      return <Gamepad2 className={className} />
  }
};

import { formatDate, isEndingSoon } from '@/features/media/game/utils/free-games'
import { useCountdown } from '@/features/discover/hooks/use-countdown'

interface FreeGamePromotionBannerProps {
  detail: MediaItemDetail
  className?: string
}

export const FreeGamePromotionBanner = ({ detail, className }: FreeGamePromotionBannerProps) => {
  const { promotions, hasPromotion } = useGameFreePromotions(detail)
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!hasPromotion || promotions.length === 0) return null

  const currentPromo = promotions[selectedIndex] || promotions[0]
  if (!currentPromo) return null

  return (
    <FreePromoCard
      currentPromo={currentPromo}
      promotions={promotions}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      className={className}
    />
  )
};

interface FreePromoCardProps {
  currentPromo: FreePromotionItem
  promotions: FreePromotionItem[]
  selectedIndex: number
  setSelectedIndex: (idx: number) => void
  className?: string
}

const FreePromoCard = ({
  currentPromo,
  promotions,
  selectedIndex,
  setSelectedIndex,
  className,
}: FreePromoCardProps) => {
  const [copied, setCopied] = useState(false)
  const isNow = currentPromo.isFreeNow
  const countdown = useCountdown(currentPromo.endDate)
  const ending = isEndingSoon(currentPromo.endDate)
  const isDlcOrPack = currentPromo.itemType === 'dlc' || currentPromo.itemType === 'pack' || currentPromo.itemType === 'bundle'
  const typeLabel = currentPromo.itemType === 'bundle' ? 'Bundle' : currentPromo.itemType === 'pack' ? 'Pack' : 'DLC'

  const handleClaim = (promo: FreePromotionItem) => {
    if (!promo.claimUrl) return
    openSessionWindow(promo.claimUrl)
    showToast({
      title: 'Opening Store Page',
      description: `Opening ${promo.storeName} to claim your free copy.`,
      variant: 'info',
    })
  }

  const handleCopyLink = async (promo: FreePromotionItem) => {
    if (!promo.claimUrl) return
    try {
      await navigator.clipboard.writeText(promo.claimUrl)
      setCopied(true)
      showToast({
        title: 'Link Copied',
        description: 'Store claim link copied to clipboard.',
        variant: 'success',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast({
        title: 'Could not copy link',
        variant: 'error',
      })
    }
  }

  return (
    <div
      id="free-game-promotion-banner"
      className={cn(
        'glass-card relative overflow-hidden p-6 sm:p-7 space-y-4',
        className,
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Left Section: Store Branding + Promo Details */}
        <div className="flex-1 space-y-2.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Promo Type Badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                isDlcOrPack
                  ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                  : isNow
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
              )}
            >
              <Gift className="h-3.5 w-3.5 shrink-0" />
              <span>
                {isNow
                  ? (isDlcOrPack ? `Free ${typeLabel}` : 'Free Giveaway')
                  : (isDlcOrPack ? `Upcoming ${typeLabel}` : 'Upcoming Giveaway')}
              </span>
            </span>

            {/* Store Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--dk-surface-glass)] text-foreground text-xs font-medium">
              <StoreIcon store={currentPromo.store} className="h-3.5 w-3.5 shrink-0" />
              <span>{currentPromo.storeName}</span>
            </div>

            {/* Multiple Stores Toggle */}
            {promotions.length > 1 && (
              <div className="flex items-center gap-1 bg-[var(--dk-surface-glass)] p-0.5 rounded-xl">
                {promotions.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1',
                      selectedIndex === idx
                        ? 'bg-[var(--dk-surface-base)] text-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <StoreIcon store={p.store} className="h-3 w-3" />
                    <span>{p.storeName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Heading + Price */}
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <span>
                {isNow
                  ? (isDlcOrPack && currentPromo.title
                    ? `Claim free ${typeLabel}: ${currentPromo.title}`
                    : 'Claim this game for free!')
                  : (isDlcOrPack && currentPromo.title
                    ? `Free ${typeLabel} coming soon: ${currentPromo.title}`
                    : 'Free giveaway coming soon!')}
              </span>
              <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
            </h3>

            {isNow && currentPromo.originalPrice && (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="line-through text-muted-foreground/60">
                  {currentPromo.originalPrice}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  100% OFF · FREE
                </span>
              </div>
            )}
          </div>

          {/* Countdown & Timing Info */}
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5 text-xs">
            {isNow && countdown && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-xl',
                  ending
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-[var(--dk-surface-glass)] text-muted-foreground',
                )}
              >
                {ending ? (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <Timer className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <span>{countdown}</span>
                {currentPromo.endDate && (
                  <span className="text-muted-foreground/70 font-normal">
                    (Ends {formatDate(currentPromo.endDate)})
                  </span>
                )}
              </span>
            )}

            {!isNow && currentPromo.startDate && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-400 font-medium">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>Starts {formatDate(currentPromo.startDate)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Interactive Action Controls */}
        <div className="flex flex-row md:flex-col sm:items-stretch items-center gap-2 shrink-0">
          {currentPromo.claimUrl && (
            <button
              type="button"
              onClick={() => handleClaim(currentPromo)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] hover:scale-[1.02] bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            >
              <Gift className="h-4 w-4 shrink-0" />
              <span>
                {isNow
                  ? `Claim on ${currentPromo.storeName}`
                  : `View on ${currentPromo.storeName}`}
              </span>
              <ExternalLink className="h-3.5 w-3.5 opacity-70 shrink-0" />
            </button>
          )}

          {currentPromo.claimUrl && (
            <button
              type="button"
              onClick={() => handleCopyLink(currentPromo)}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-base)] transition-colors"
              title="Copy store link to clipboard"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Link Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
};
