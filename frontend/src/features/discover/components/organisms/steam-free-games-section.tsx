import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Gamepad2, ExternalLink, Gift, AlertCircle } from 'lucide-react'
import { Carousel } from '@ui/molecules/carousel'
import { useSteamFreePacksSetting } from '@/features/settings/hooks/use-steam-free-packs-setting'
import { cn } from '@/lib/utils'

interface SteamFreeGame {
  id: number
  title: string
  appId: number
  posterUrl: string | null
  originalPrice: string | null
  freeEndDate: string | null
  urlSlug: string | null
  description: string | null
  seller: string | null
  kind?: string
  itemType?: string
  baseGameTitle?: string
  claimUrl?: string
}

interface FreeCheckResult {
  success: boolean
  freeGames: SteamFreeGame[]
  newGames?: SteamFreeGame[]
  isAuthenticated: boolean
  alreadyOwned?: number
  error?: string
}

function getPluginAPI() {
  return (window as any).desktopAPI?.plugin as
    | { callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown> }
    | undefined
}

export function SteamFreeGamesSection() {
  const [result, setResult] = useState<FreeCheckResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSteamPacks] = useSteamFreePacksSetting()

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
      const res = (await api.callData('steam', 'free.check')) as FreeCheckResult
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

  // Not running in Otix desktop — no plugin API
  if (!getPluginAPI()) return null

  // Loading state
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

  // Error state
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
          <span>Steam free games check failed: {error}</span>
        </div>
      </motion.section>
    )
  }

  // No free games
  const rawFreeGames = Array.isArray(result?.freeGames) ? result.freeGames.filter((g) => g && g.id) : []
  const isPack = (g: SteamFreeGame) => {
    const itemType = g.itemType?.toLowerCase()
    const kind = g.kind?.toLowerCase()
    return itemType === 'dlc' || itemType === 'pack' || itemType === 'bundle' || kind === 'sub' || kind === 'bundle'
  }
  const freeGames = showSteamPacks ? rawFreeGames : rawFreeGames.filter((g) => !isPack(g))
  if (freeGames.length === 0) return null

  const { isAuthenticated, alreadyOwned } = result!
  const unclaimed = isAuthenticated ? freeGames.length - (alreadyOwned ?? 0) : freeGames.length
  const isClaimable = unclaimed > 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5 }}
    >
      <Carousel
        title="🎮 Free Steam Games"
        subtitle={
          <span className="text-xs text-white/40">
            {isAuthenticated
              ? isClaimable
                ? `${unclaimed} unclaimed · ${alreadyOwned} owned`
                : 'All claimed'
              : 'Connect Steam to check ownership'}
          </span>
        }
        minItemWidth={185}
        gap={12}
      >
        {freeGames.map((game) => (
          <SteamFreeGameCard key={game.id} game={game} isClaimable={isClaimable} />
        ))}
      </Carousel>
    </motion.section>
  )
}

function SteamFreeGameCard({ game, isClaimable }: { game: SteamFreeGame; isClaimable: boolean }) {
  const isDlcOrPack = game.itemType === 'dlc' || game.itemType === 'pack' || game.itemType === 'bundle'
  const typeLabel = game.itemType === 'bundle' ? 'Bundle' : game.itemType === 'pack' ? 'Pack' : 'DLC'

  const claimUrl =
    game.claimUrl ||
    (game.kind === 'sub'
      ? `https://store.steampowered.com/sub/${game.id}`
      : game.kind === 'bundle'
        ? `https://store.steampowered.com/bundle/${game.id}`
        : `https://store.steampowered.com/app/${game.appId || game.id}`)

  return (
    <div className="group relative w-full select-none">
      {/* Poster */}
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative">
        {game.posterUrl ? (
          <img
            src={game.posterUrl}
            alt={game.title}
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
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-lg',
              isDlcOrPack ? 'bg-purple-500 text-white' : 'bg-emerald-500/90 text-white',
            )}
          >
            <Gift className="h-3 w-3" />
            {isDlcOrPack ? `FREE ${typeLabel}` : 'FREE'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-2 px-0.5">
        <p className="text-xs font-medium text-white/80 truncate leading-tight">{game.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-semibold text-emerald-400">FREE</span>
          {game.originalPrice && (
            <span className="text-[10px] text-white/30 line-through">{game.originalPrice}</span>
          )}
        </div>
        {game.seller && (
          <p className="text-[10px] text-white/30 truncate mt-0.5">{game.seller}</p>
        )}
      </div>

      {/* Claim CTA overlay on hover */}
      {isClaimable && (
        <a
          href={claimUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold shadow-lg">
            <ExternalLink className="h-3.5 w-3.5" />
            {isDlcOrPack ? `Claim ${typeLabel}` : 'Claim'}
          </span>
        </a>
      )}
    </div>
  )
}
