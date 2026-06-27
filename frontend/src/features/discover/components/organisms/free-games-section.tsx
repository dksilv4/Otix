import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Gamepad2, ExternalLink, Gift, AlertCircle } from 'lucide-react'
import { MediaCard } from '@/old-features/ui/molecules/media-card'
import { Carousel } from '@/old-features/ui/molecules/carousel'

interface FreeGameResult {
  media_item: any | null
  matched: boolean
  store: string
  store_label: string | null
  original_price: string | null
  free_end_date: string | null
  claim_url: string | null
  poster_url: string | null
  title: string | null
  external_id: string
}

interface AggregatedResult {
  items: FreeGameResult[]
  fetchedAt: number
}

const STORE_LABELS: Record<string, string> = {
  epic: 'Epic Games',
  steam: 'Steam',
  gog: 'GOG',
  humble: 'Humble',
  fanatical: 'Fanatical',
  amazon: 'Amazon',
  uplay: 'Ubisoft',
  origin: 'EA',
  blizzard: 'Blizzard',
}

function getPluginAPI() {
  return (window as any).desktopAPI?.plugin as
    | { getFreeGames: () => Promise<AggregatedResult> }
    | undefined
}

export function FreeGamesSection() {
  const [result, setResult] = useState<AggregatedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const api = getPluginAPI()
    if (!api) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await api.getFreeGames()
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load free games')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
          <div className="h-6 w-56 rounded bg-white/5 animate-pulse" />
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
          <span>Free games check failed: {error}</span>
        </div>
      </motion.section>
    )
  }

  if (!result?.items?.length) return null

  const matchedCount = result.items.filter(i => i.matched).length
  const unmatchedCount = result.items.length - matchedCount

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      <Carousel
        title="🎮 Free Games"
        subtitle={
          <span className="text-xs text-white/40">
            {matchedCount} game{matchedCount !== 1 ? 's' : ''} free right now
            {unmatchedCount > 0 && ` · ${unmatchedCount} unmatched`}
          </span>
        }
        minItemWidth={185}
        gap={12}
      >
        {result.items.map((item) => (
          <FreeGameCard key={`${item.store}:${item.external_id}`} item={item} />
        ))}
      </Carousel>
    </motion.section>
  )
}

function FreeGameCard({ item }: { item: FreeGameResult }) {
  const storeLabel = item.store_label || STORE_LABELS[item.store] || item.store
  const endDate = item.free_end_date
    ? new Date(item.free_end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  // Matched to Otix media — use MediaCard
  if (item.matched && item.media_item) {
    return (
      <div className="group relative w-full select-none">
        <MediaCard item={item.media_item} size="poster" />
        {/* FREE overlay */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/90 text-white shadow-lg">
            <Gift className="h-3 w-3" />
            FREE
          </span>
          {item.original_price && (
            <span className="inline-block px-2 py-0.5 rounded text-[9px] font-medium bg-black/60 text-white/70 backdrop-blur-sm">
              {item.original_price}
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 z-10">
          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/70 backdrop-blur-sm">
            via {storeLabel}
          </span>
        </div>
        {endDate && (
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white/80 backdrop-blur-sm">
              Ends {endDate}
            </span>
          </div>
        )}
        {/* Claim CTA */}
        {item.claim_url && (
          <a
            href={item.claim_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 z-20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow-lg">
              <ExternalLink className="h-3.5 w-3.5" />
              Claim
            </span>
          </a>
        )}
      </div>
    )
  }

  // Unmatched — show fallback card with poster and basic info
  return (
    <div className="group relative w-full select-none">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative">
        {item.poster_url ? (
          <img
            src={item.poster_url}
            alt={item.title || 'Free game'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="h-8 w-8 text-white/20" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/90 text-white shadow-lg">
            <Gift className="h-3 w-3" />
            FREE
          </span>
        </div>
        <div className="absolute top-2 right-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/70 backdrop-blur-sm">
            via {storeLabel}
          </span>
        </div>
        {endDate && (
          <div className="absolute bottom-2 left-2 right-2">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white/80 backdrop-blur-sm">
              Ends {endDate}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-xs font-medium text-white/80 truncate leading-tight">{item.title || 'Unknown'}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-semibold text-emerald-400">FREE</span>
          {item.original_price && (
            <span className="text-[10px] text-white/30 line-through">{item.original_price}</span>
          )}
        </div>
        <p className="text-[10px] text-white/30 truncate mt-0.5">{storeLabel}</p>
      </div>
      {item.claim_url && (
        <a
          href={item.claim_url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow-lg">
            <ExternalLink className="h-3.5 w-3.5" />
            Claim
          </span>
        </a>
      )}
    </div>
  )
}
