import { useState, useEffect } from 'react'
import type { ScannedGameItem } from '../utils/scanned-summary'
import type { ProcessedGameTheme } from '../utils/node-scan-palette'
import {
  hexToRgb,
  buildThemeFromColors,
  getFallbackTheme,
  getCachedTheme,
  extractThemeFromImageUrl,
} from '../utils/node-scan-palette'

/**
 * Hook to extract and theme a scanned game row using its backdrop/poster artwork and main colors.
 * Always calls hooks unconditionally in accordance with the Rules of Hooks.
 */
export function useNodeRowTheme(item: ScannedGameItem): ProcessedGameTheme | null {
  const isMatched = Boolean(item.matched)
  const imageUrl = isMatched ? item.backdropUrl || item.posterUrl || item.iconUrl || null : null
  const hexDominant = isMatched
    ? item.dominantColor || item.rawGame?.dominantColor || item.rawGame?.dominant_color || null
    : null

  const [theme, setTheme] = useState<ProcessedGameTheme | null>(() => {
    if (!isMatched) return null

    // 1. If pre-cached, use instantly
    const cached = getCachedTheme(imageUrl)
    if (cached) return cached

    // 2. If precomputed dominant color exists, build theme immediately
    const parsedHex = hexToRgb(hexDominant)
    if (parsedHex) {
      return buildThemeFromColors(parsedHex, null, imageUrl)
    }

    // 3. Fallback deterministic theme (image URL is still set in rowStyle)
    return getFallbackTheme(item.title || 'game', imageUrl)
  })

  useEffect(() => {
    if (!isMatched) {
      setTheme(null)
      return
    }

    if (!imageUrl) {
      const parsedHex = hexToRgb(hexDominant)
      if (parsedHex) {
        setTheme(buildThemeFromColors(parsedHex, null, null))
      } else {
        setTheme(getFallbackTheme(item.title || 'game', null))
      }
      return
    }

    // If already in cache, ensure state is synchronized
    const cached = getCachedTheme(imageUrl)
    if (cached) {
      setTheme(cached)
      return
    }

    let active = true
    void extractThemeFromImageUrl(imageUrl, item.title).then((extracted) => {
      if (active) {
        setTheme(extracted)
      }
    })

    return () => {
      active = false
    }
  }, [isMatched, imageUrl, hexDominant, item.title])

  return isMatched ? theme : null
}
