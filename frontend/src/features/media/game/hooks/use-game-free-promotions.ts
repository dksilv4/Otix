import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { discoverQueries, type FreeGameItem } from '@/features/discover/queries/discover-queries'
import type { MediaItemDetail, FreePromotionItem } from '../../queries/media-queries'

function normalizeTitle(title: string | null | undefined): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[™®©℠:]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export function useGameFreePromotions(detail?: MediaItemDetail | null) {
  const isGameType = detail?.mediaType === 'game'

  const { data: freeGamesData, isLoading } = useQuery({
    ...discoverQueries.freeGames(),
    enabled: isGameType,
  })

  return useMemo(() => {
    if (!detail || !isGameType) {
      return {
        promotions: [] as FreePromotionItem[],
        activePromotion: null,
        upcomingPromotion: null,
        isFreeNow: false,
        hasPromotion: false,
        isLoading: false,
      }
    }

    const promoMap = new Map<string, FreePromotionItem>()

    // 1. Add any promotions directly attached to media detail by backend
    if (Array.isArray(detail.freePromotions)) {
      for (const p of detail.freePromotions) {
        if (p && p.id) {
          promoMap.set(p.id, p)
        }
      }
    }

    // 2. Scan live free games aggregator feed as fallback/real-time enrichment
    if (freeGamesData) {
      const allItems: Array<{ item: FreeGameItem; isFreeNow: boolean }> = [
        ...(Array.isArray(freeGamesData.current)
          ? freeGamesData.current.map((item) => ({ item, isFreeNow: true }))
          : []),
        ...(Array.isArray(freeGamesData.upcoming)
          ? freeGamesData.upcoming.map((item) => ({ item, isFreeNow: false }))
          : []),
      ]

      const detailIdStr = detail.id ? String(detail.id) : null
      const detailSlug = detail.slug || null
      const detailNorm = normalizeTitle(detail.title)
      const steamAppIdStr = detail.game?.steamAppId ? String(detail.game.steamAppId) : null

      for (const { item, isFreeNow } of allItems) {
        const itemMidStr = item.mediaItem?.id ? String(item.mediaItem.id) : null
        const itemSlug = item.mediaItem?.slug || null
        const itemExtStr = item.externalId ? String(item.externalId) : null
        const itemNorm = normalizeTitle(item.title)

        const isMatch =
          (detailIdStr && itemMidStr && detailIdStr === itemMidStr) ||
          (detailSlug && itemSlug && detailSlug === itemSlug) ||
          (steamAppIdStr && itemExtStr && steamAppIdStr === itemExtStr) ||
          (detailNorm && itemNorm && detailNorm === itemNorm)

        if (isMatch) {
          const promoId = item.id || `${item.store}:${item.title}:${isFreeNow ? 'now' : 'soon'}`
          if (!promoMap.has(promoId)) {
            promoMap.set(promoId, {
              id: promoId,
              store: item.store,
              storeName: item.storeName || item.store,
              title: item.title,
              description: item.description,
              originalPrice: item.originalPrice,
              discountPercentage: item.discountPercentage ?? (isFreeNow ? 100 : undefined),
              isFreeNow,
              startDate: item.startDate,
              endDate: item.endDate,
              claimUrl: item.claimUrl,
            })
          }
        }
      }
    }

    const promotions = Array.from(promoMap.values())
    const activePromotion = promotions.find((p) => p.isFreeNow) || null
    const upcomingPromotion = promotions.find((p) => !p.isFreeNow) || null

    return {
      promotions,
      activePromotion,
      upcomingPromotion,
      isFreeNow: Boolean(activePromotion),
      hasPromotion: promotions.length > 0,
      isLoading,
    }
  }, [detail, isGameType, freeGamesData, isLoading])
}
