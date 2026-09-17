import { useState, useEffect } from 'react'
import { Gift, ExternalLink, CalendarDays, Gamepad2, Sparkles } from 'lucide-react'
import { getPluginAPI } from '@/features/plugins/api'
import { openSessionWindow } from '@/lib/utils/open-external'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import { ProviderLogo } from '../atoms/provider-logo'
import { Carousel } from '@ui/molecules/carousel'

interface EpicFreeGame {
  id: string
  title: string
  namespace: string
  offerId: string
  seller?: string | null
  description?: string | null
  posterUrl?: string | null
  urlSlug?: string | null
  freeEndDate?: string | null
  originalPrice?: string | null
  claimed?: boolean
}

interface FreeCheckResult {
  success: boolean
  freeGames: EpicFreeGame[]
  unclaimedGames?: EpicFreeGame[]
  upcomingGames: EpicFreeGame[]
  isAuthenticated: boolean
  alreadyOwned: number
}

const EPIC_FREE_PAGE = 'https://store.epicgames.com/free-games'

function claimUrl(game: EpicFreeGame): string {
  // offerId is NOT a valid product-page slug — only urlSlug navigates to the
  // game. Without one, drop to the free-games page where it can be claimed.
  return game.urlSlug ? `https://store.epicgames.com/p/${game.urlSlug}` : EPIC_FREE_PAGE
}

function FreeClaimCard({ game }: { game: EpicFreeGame }) {
  const [posterError, setPosterError] = useState(false)

  const endDate = game.freeEndDate
    ? new Date(game.freeEndDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  // Opens in an in-app window on the default session — the same session the
  // Epic OAuth login ran in, so the store page is already signed in.
  const handleClaim = () => openSessionWindow(claimUrl(game))

  return (
    <button
      type="button"
      onClick={handleClaim}
      className="group relative block w-full text-left aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-1 hover:ring-emerald-400/50 hover:shadow-[0_12px_40px_-10px_rgba(16,185,129,0.45)]"
    >
      {/* Poster art */}
      {game.posterUrl && !posterError ? (
        <img
          src={game.posterUrl}
          alt={game.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setPosterError(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
          <Gamepad2 className="h-10 w-10 text-white/10" />
        </div>
      )}

      {/* Contrast gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />

      {/* Top row: FREE badge + Epic logo */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_2px_14px_rgba(16,185,129,0.55)]">
          <Gift className="h-3 w-3" />
          Free
        </span>
        <span className="inline-flex items-center rounded-lg bg-black/50 px-1.5 py-1 backdrop-blur-sm">
          <ProviderLogo platform="epic" className="h-3 w-3" />
        </span>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-3">
        <h4 className="line-clamp-2 text-xs font-bold leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {game.title}
        </h4>
        <div className="mt-1.5 flex items-center gap-2">
          {game.originalPrice && (
            <span className="text-[10px] font-medium text-white/50 line-through">{game.originalPrice}</span>
          )}
          <span className="text-[10px] font-bold text-emerald-400">FREE</span>
        </div>
        {endDate && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-white/70">
            <CalendarDays className="h-3 w-3" />
            Ends {endDate}
          </span>
        )}
      </div>

      {/* Hover claim CTA */}
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[0_4px_20px_rgba(16,185,129,0.55)] transition-transform duration-200 group-hover:scale-105">
          <ExternalLink className="h-3.5 w-3.5" />
          Claim Now
        </span>
      </div>
    </button>
  )
}

export function SettingsFreeGamesSection() {
  const [games, setGames] = useState<EpicFreeGame[] | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const api = getPluginAPI()
  const apiAvailable = typeof api?.callData === 'function' && typeof api?.get === 'function'

  useEffect(() => {
    if (!apiAvailable) return
    let cancelled = false
    const run = async () => {
      try {
        const pluginApi = getPluginAPI()!
        // The section only renders for the otix-epic plugin. Respect an
        // explicit disable, but otherwise ensure it's actually running before
        // calling free.check — callData throws PluginNotRunningError when the
        // plugin hasn't started yet (e.g. right after app boot). enable() is
        // idempotent: it no-ops when already running.
        const info = await pluginApi.get('otix-epic')
        if (!info || info.status === 'disabled') {
          if (!cancelled) setGames([])
          return
        }
        if (info.status !== 'enabled') {
          await pluginApi.enable('otix-epic')
        }
        const raw = (await pluginApi.callData('otix-epic', 'free.check')) as FreeCheckResult
        if (cancelled) return
        setIsAuthenticated(!!raw?.isAuthenticated)
        const list = raw?.unclaimedGames ?? raw?.freeGames ?? []
        setGames(list.filter((g) => !g.claimed))
      } catch (err) {
        console.warn('[SettingsFreeGamesSection] free.check failed:', err)
        if (!cancelled) setGames([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [apiAvailable])

  if (!apiAvailable || games?.length === 0) return null

  if (games === null) {
    return (
      <SettingsCard compact className="space-y-4">
        <div className="h-5 w-40 rounded bg-white/5 animate-pulse" />
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[160px] aspect-[3/4] rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard compact>
      <SectionHeader
        icon={Gift}
        title="Free Games"
        description={
          isAuthenticated
            ? `${games.length} unclaimed game${games.length !== 1 ? 's' : ''} free on Epic right now`
            : `${games.length} free game${games.length !== 1 ? 's' : ''} on Epic right now`
        }
        action={
          <button
            type="button"
            onClick={() => openSessionWindow(EPIC_FREE_PAGE)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/80 transition-all hover:bg-white/[0.12] hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Open Epic Store
          </button>
        }
      />
      <Carousel minItemWidth={160} gap={12}>
        {games.map((game) => (
          <FreeClaimCard key={game.namespace + ':' + game.offerId} game={game} />
        ))}
      </Carousel>
    </SettingsCard>
  )
}
