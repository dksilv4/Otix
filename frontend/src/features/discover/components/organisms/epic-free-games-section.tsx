import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Gamepad2, ExternalLink, Gift, AlertCircle, Eye } from 'lucide-react'
import { Carousel } from '@ui/molecules/carousel'

interface EpicFreeGame {
  id: string
  title: string
  namespace: string
  offerId: string
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
}

interface GameMatch {
  media_item_id?: string
  title: string
  poster_url?: string | null
}

interface MatchedEntry {
  game: EpicFreeGame
  match: GameMatch | null
  candidates: GameMatch[]
  error?: string
}

interface MatchResult {
  success: boolean
  matched: MatchedEntry[]
  isAuthenticated: boolean
  alreadyOwned?: number
}

import { getPluginAPI } from '@/features/discover/utils/plugins'

export const EpicFreeGamesSection = () => {
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const check = useCallback(async () => {
    const api = getPluginAPI()
    if (!api) {
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = (await api.callData('otix-epic', 'free.match')) as MatchResult
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  if (!getPluginAPI()) return null

  if (loading) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="space-y-4">
          <div className="h-6 w-48 rounded bg-white/5 animate-pulse" />
          <div className="flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[185px] aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      </motion.section>
    )
  }

  if (error) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Epic free games check failed: {error}</span>
        </div>
      </motion.section>
    )
  }

  if (!Array.isArray(result?.matched) || result.matched.length === 0) return null

  const { matched, isAuthenticated, alreadyOwned } = result
  const unclaimed = matched.length - (alreadyOwned ?? 0)
  const isClaimable = isAuthenticated && unclaimed > 0

  // Count how many have Otix matches
  const matchedCount = matched.filter((m) => m.match?.media_item_id).length

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      <Carousel
        title="🎮 Free Epic Games"
        subtitle={
          <span className="text-xs text-muted-foreground">
            {isClaimable
              ? `${unclaimed} unclaimed · ${alreadyOwned} owned`
              : isAuthenticated
                ? 'All claimed'
                : 'Sign in to check ownership'}
            {matchedCount > 0 && ` · ${matchedCount} matched in Otix`}
          </span>
        }
        minItemWidth={185}
        gap={12}
      >
        {matched.map((entry) => (
          <EpicFreeGameCard
            key={entry.game.id}
            entry={entry}
            isClaimable={isClaimable}
            onViewDetails={(mediaId) => navigate({ to: '/media/game/$mediaId', params: { mediaId } })}
          />
        ))}
      </Carousel>
    </motion.section>
  )
};

const EpicFreeGameCard = ({
  entry,
  isClaimable,
  onViewDetails,
}: {
  entry: MatchedEntry
  isClaimable: boolean
  onViewDetails: (mediaId: string) => void
}) => {
  const { game, match } = entry
  const hasMatch = !!match?.media_item_id
  const poster = match?.poster_url || game.posterUrl
  const displayTitle = match?.title || game.title

  const endDate = game.freeEndDate
  ? new Date(game.freeEndDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  : null

  const handleClick = () => {
    if (hasMatch && match?.media_item_id) {
      onViewDetails(match.media_item_id)
    } else if (isClaimable) {
      window.open(
        `https://www.epicgames.com/store/en-US/p/${game.urlSlug || game.id}`,
        '_blank',
        'noopener'
      )
    }
  }

  return (
    <div
      className="group relative w-full select-none cursor-pointer"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick() }}
    >
      {/* Poster */}
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-muted relative">
        {poster ? (
          <img
            src={poster}
            alt={displayTitle}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/90 text-white shadow-lg">
            <Gift className="h-3 w-3" />
            FREE
          </span>
          {hasMatch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/80 text-white shadow-lg backdrop-blur-sm">
              <Eye className="h-3 w-3" />
              In Otix
            </span>
          )}
        </div>

        {/* End date */}
        {endDate && (
          <div className="absolute bottom-2 left-2 right-2">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white/80 backdrop-blur-sm">
              Ends {endDate}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 px-0.5">
        <p className="text-xs font-medium text-foreground truncate leading-tight">{displayTitle}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-semibold text-emerald-400">FREE</span>
          {game.originalPrice && (
            <span className="text-[10px] text-muted-foreground line-through">{game.originalPrice}</span>
          )}
        </div>
        {game.seller && !hasMatch && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{game.seller}</p>
        )}
      </div>

      {/* Hover overlay */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
        onClick={(e) => e.stopPropagation()}
      >
        {hasMatch ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-semibold shadow-lg">
            <Eye className="h-3.5 w-3.5" />
            View in Otix
          </span>
        ) : isClaimable ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow-lg">
            <ExternalLink className="h-3.5 w-3.5" />
            Claim on Epic
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--dk-surface-ghost)] text-foreground border border-[var(--dk-separator)] text-xs font-semibold shadow-lg backdrop-blur-sm">
            <ExternalLink className="h-3.5 w-3.5" />
            View on Epic
          </span>
        )}
      </div>
    </div>
  )
};
