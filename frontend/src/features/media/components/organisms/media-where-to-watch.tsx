import { useState } from 'react'
import { Tv, ExternalLink, Play } from 'lucide-react'
import type { MediaWatchProvider } from '@media'
import { API_BASE_URL } from '@/lib/config'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { cn } from '@/lib/utils'

interface WhereToWatchProps {
  watchProviders?: MediaWatchProvider[]
  className?: string
  mediaType?: string
}

export type WhereToWatchV4Props = WhereToWatchProps

type CommercialCategory = 'stream' | 'rent' | 'buy'

const COMMERCIAL_MAP: Record<CommercialCategory, { label: string; types: string[]; color: string; badge: string }> = {
  stream: {
    label: 'Stream',
    types: ['flatrate', 'free', 'ads'],
    color: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-400',
  },
  rent: {
    label: 'Rent',
    types: ['rent'],
    color: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400',
  },
  buy: {
    label: 'Buy',
    types: ['buy'],
    color: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-400',
  },
}

function resolveProviderUrl(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith('/api/')) {
    const base = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL.slice(0, -7) : API_BASE_URL
    return `${base}${url}`
  }
  return url
}

export function WhereToWatch({ watchProviders = [], className = '', mediaType }: WhereToWatchProps) {
  const [activeTab, setActiveTab] = useState<CommercialCategory>('stream')

  // Games do not have "Where to Watch" or movie/show video streaming providers
  if (mediaType === 'game') {
    return null
  }

  const validProviders = watchProviders.filter((p) => Boolean(p.watchProvider))

  // 1. Separate Personal Library providers (Plex / self-hosted)
  const personalProviders = validProviders.filter(
    (p) => p.offeringType === 'personal' || p.watchProvider?.slug === 'plex',
  )

  // 2. Commercial providers (Stream, Rent, Buy)
  const commercialProviders = validProviders.filter(
    (p) => p.offeringType !== 'personal' && p.watchProvider?.slug !== 'plex',
  )

  const categorized: Partial<Record<CommercialCategory, MediaWatchProvider[]>> = {}
  for (const cat of ['stream', 'rent', 'buy'] as CommercialCategory[]) {
    const matched = commercialProviders.filter((p) => COMMERCIAL_MAP[cat].types.includes(p.offeringType))
    if (matched.length > 0) {
      categorized[cat] = matched
    }
  }

  const availableCategories = (['stream', 'rent', 'buy'] as CommercialCategory[]).filter(
    (c) => categorized[c] && categorized[c]!.length > 0,
  )

  const currentTab = availableCategories.includes(activeTab) ? activeTab : (availableCategories[0] || 'stream')

  if (validProviders.length === 0 || (availableCategories.length === 0 && personalProviders.length === 0)) {
    return null
  }

  const currentProviders = categorized[currentTab] ?? []

  return (
    <div className={`glass-card p-5 sm:p-6 space-y-4 ${className}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-primary">
            <Tv className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">Where to Watch</h3>
        </div>

        {/* Commercial Tabs */}
        {availableCategories.length > 1 && (
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-0.5">
            {availableCategories.map((cat) => {
              const count = categorized[cat]?.length ?? 0
              const isActive = currentTab === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveTab(cat)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                    isActive
                      ? 'bg-white/10 text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {COMMERCIAL_MAP[cat].label}
                  <span className="ml-1 text-[10px] opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Spotlight: Personal Library Highlight Banner ── */}
      {personalProviders.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent p-3.5 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5a00d] text-black shadow-md shrink-0">
                <PlexIcon className="h-5 w-5 fill-current" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-amber-300">In Your Library</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                </div>
                <p className="text-[11px] text-white/70 truncate">Ready to stream on your private server</p>
              </div>
            </div>

            {personalProviders[0]?.url && (
              <a
                href={resolveProviderUrl(personalProviders[0].url) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black shadow hover:bg-amber-300 transition-colors shrink-0"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Play</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Commercial Stream / Rent / Buy Grid ── */}
      {currentProviders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          {currentProviders.map((provider) => {
            const wp = provider.watchProvider
            if (!wp) return null

            const url = resolveProviderUrl(provider.url)

            const chipContent = (
              <div className="glass-inset group flex items-center justify-between gap-2.5 p-2.5 rounded-xl hover:bg-white/[0.08] transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  {wp.logoUrl ? (
                    <img
                      src={wp.logoUrl}
                      alt=""
                      className="h-7 w-7 rounded-lg object-contain bg-black/30 shrink-0"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-bold text-muted-foreground shrink-0">
                      {wp.name.slice(0, 2)}
                    </div>
                  )}
                  <span className="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                    {wp.name}
                  </span>
                </div>

                {url && (
                  <ExternalLink className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                )}
              </div>
            )

            return url ? (
              <a
                key={provider.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block outline-none focus-visible:ring-1 focus-visible:ring-primary rounded-xl"
              >
                {chipContent}
              </a>
            ) : (
              <div key={provider.id}>{chipContent}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { WhereToWatch as WhereToWatchV4 }
