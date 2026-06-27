import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Gamepad2, ExternalLink, Gift, AlertCircle } from 'lucide-react'
import { Carousel } from '@/old-features/dk-ui/molecules/carousel'

interface DealGame {
  id: string
  title: string
  storeId: number
  storeName: string
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
  storeUrl: string | null
  steamAppId: number | null
}

interface DealsCheckResult {
  success: boolean
  deals: DealGame[]
  newDeals?: DealGame[]
  error?: string
}

function getPluginAPI() {
  return (window as any).desktopAPI?.plugin as
    | { callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown> }
    | undefined
}

export function DealsFreeGamesSection() {
  const [result, setResult] = useState<DealsCheckResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const res = (await api.callData('deals', 'free.check')) as DealsCheckResult
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
          <span>Free deals check failed: {error}</span>
        </div>
      </motion.section>
    )
  }

  if (!result?.deals?.length) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      <Carousel
        title="🎮 Free Game Deals"
        subtitle={
          <span className="text-xs text-white/40">
            {result.deals.length} free deal{result.deals.length > 1 ? 's' : ''} across {new Set(result.deals.map(d => d.storeName)).size} store{new Set(result.deals.map(d => d.storeName)).size > 1 ? 's' : ''}
          </span>
        }
        minItemWidth={185}
        gap={12}
      >
        {result.deals.map((deal) => (
          <DealGameCard key={deal.id} deal={deal} />
        ))}
      </Carousel>
    </motion.section>
  )
}

function DealGameCard({ deal }: { deal: DealGame }) {
  return (
    <div className="group relative w-full select-none">
      {/* Poster */}
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative">
        {deal.posterUrl ? (
          <img
            src={deal.posterUrl}
            alt={deal.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 className="h-8 w-8 text-white/20" />
          </div>
        )}

        {/* FREE badge */}
        <div className="absolute top-2 left-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/90 text-white shadow-lg">
            <Gift className="h-3 w-3" />
            FREE
          </span>
        </div>

        {/* Store badge */}
        <div className="absolute top-2 right-2">
          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/70 backdrop-blur-sm">
            {deal.storeName}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-2 px-0.5">
        <p className="text-xs font-medium text-white/80 truncate leading-tight">{deal.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-semibold text-emerald-400">FREE</span>
          {deal.originalPrice && (
            <span className="text-[10px] text-white/30 line-through">{deal.originalPrice}</span>
          )}
        </div>
        <p className="text-[10px] text-white/30 truncate mt-0.5">{deal.storeName}</p>
      </div>

      {/* Claim CTA overlay on hover */}
      {deal.storeUrl && (
        <a
          href={deal.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
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
