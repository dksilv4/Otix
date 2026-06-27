// desktop/free-games/aggregator.ts
//
// Discovers all "free-games-provider" plugins, collects their free games,
// matches against Otix catalog via backend, deduplicates, and caches.

import type { PluginManager } from '../plugins/manager'

// ── Types ──────────────────────────────────────────────────────────────

export interface FreeGameRef {
  store: string
  external_id: string
  title?: string | null
  original_price?: string | null
  free_end_date?: string | null
  claim_url?: string | null
  poster_url?: string | null
  store_label?: string | null
}

export interface FreeGameResult {
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

export interface AggregatedResult {
  items: FreeGameResult[]
  fetchedAt: number
}

// ── Provider map ───────────────────────────────────────────────────────

const PROVIDER_STORE_MAP: Record<string, string> = {
  'otix-epic': 'epic',
  steam: 'steam',
  deals: 'deals',
}

function inferStore(pluginId: string): string {
  return PROVIDER_STORE_MAP[pluginId] || pluginId
}

function inferStoreLabel(store: string, game: any): string {
  if (game.storeName) return game.storeName
  if (game.storeLabel) return game.storeLabel
  const labels: Record<string, string> = {
    epic: 'Epic Games Store',
    steam: 'Steam',
    gog: 'GOG',
    humble: 'Humble Store',
    fanatical: 'Fanatical',
    amazon: 'Amazon',
  }
  return labels[store] || store
}

// ── Extract store-specific external ID ────────────────────────────────

function extractExternalId(game: any, store: string): string {
  // Steam: numeric app ID
  if (store === 'steam' || game.appId) {
    return String(game.appId || game.id)
  }
  // Epic: namespace:offerId
  if (store === 'epic' || game.namespace) {
    if (game.namespace && game.offerId) return `${game.namespace}:${game.offerId}`
    return String(game.id || game.offerId || '')
  }
  // Generic: try common fields
  return String(game.appId || game.externalId || game.id || '')
}

// ── Aggregator ─────────────────────────────────────────────────────────

export class FreeGamesAggregator {
  private cache: AggregatedResult | null = null
  private cacheTtl = 5 * 60 * 1000 // 5 minutes
  private apiBaseUrl = 'http://127.0.0.1:8000/api'
  private authToken = ''

  constructor(private pluginManager: PluginManager) {}

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url
  }

  setAuthToken(token: string): void {
    this.authToken = token
  }

  async getAll(): Promise<AggregatedResult> {
    if (this.cache && (Date.now() - this.cache.fetchedAt) < this.cacheTtl) {
      return this.cache
    }

    const providers = this.pluginManager.serviceRegistry.discover('free-games-provider')
    const allRefs: FreeGameRef[] = []

    // Collect raw references from each provider
    for (const provider of providers) {
      const store = inferStore(provider.pluginId)
      try {
        const raw: any = await this.pluginManager.callPluginData(provider.pluginId, 'free.check')
        const games: any[] = raw?.freeGames || raw?.deals || raw?.games || []

        for (const game of games) {
          const externalId = extractExternalId(game, store)
          if (!externalId) continue

          allRefs.push({
            store,
            external_id: externalId,
            title: game.title || null,
            original_price: game.originalPrice || null,
            free_end_date: game.freeEndDate || null,
            claim_url: game.storeUrl || game.claimUrl || game.urlSlug
              ? (store === 'steam' ? `https://store.steampowered.com/app/${game.appId || game.id}` : null)
              : null,
            poster_url: game.posterUrl || null,
            store_label: inferStoreLabel(store, game),
          })
        }
      } catch (err: any) {
        console.error(`[FreeGamesAggregator] Provider ${provider.pluginId} failed:`, err.message)
      }
    }

    // Match against Otix catalog
    let matched: FreeGameResult[] = []
    if (allRefs.length > 0) {
      try {
        const url = `${this.apiBaseUrl}/discover/free-games/match`
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (this.authToken) {
          headers['Authorization'] = `Bearer ${this.authToken}`
        }
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ games: allRefs }),
        })
        if (resp.ok) {
          const data = await resp.json()
          matched = data.items || []
        } else {
          console.error(`[FreeGamesAggregator] Backend match failed: ${resp.status}`)
        }
      } catch (err: any) {
        console.error(`[FreeGamesAggregator] Backend match error:`, err.message)
      }
    }

    this.cache = { items: matched, fetchedAt: Date.now() }
    return this.cache
  }

  invalidateCache(): void {
    this.cache = null
  }

  async refresh(): Promise<AggregatedResult> {
    this.invalidateCache()
    return this.getAll()
  }
}
