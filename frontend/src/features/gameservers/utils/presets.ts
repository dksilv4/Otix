import { GAME_SERVER_PRESETS } from '../constants/presets'
import type { GameServerPreset } from '../types'

/**
 * Find preset by its identifier.
 */
export const findPresetById = (id: string): GameServerPreset | undefined => {
  return GAME_SERVER_PRESETS.find((p) => p.id === id)
}

/**
 * Match a preset by game title (case-insensitive substring or exact match).
 */
export const findPresetByGameTitle = (gameTitle: string): GameServerPreset | undefined => {
  if (!gameTitle.trim()) return undefined
  const cleaned = gameTitle.toLowerCase().trim()

  // Exact matches first
  const exact = GAME_SERVER_PRESETS.find(
    (p) =>
      p.name.toLowerCase() === cleaned ||
      p.gameTitle.toLowerCase() === cleaned ||
      p.id === cleaned ||
      p.otixGameId?.toLowerCase() === cleaned,
  )
  if (exact) return exact

  // Substring matches
  return GAME_SERVER_PRESETS.find(
    (p) => cleaned.includes(p.gameTitle.toLowerCase()) || p.gameTitle.toLowerCase().includes(cleaned),
  )
}

/**
 * Find all matching presets for a linked Otix game (by mediaItemId, otixGameId, or title).
 * Returns empty array if not linked or no matching presets for full support.
 */
export const findPresetsForGame = (gameIdOrTitle?: string | null): GameServerPreset[] => {
  if (!gameIdOrTitle || !gameIdOrTitle.trim()) return []
  const cleaned = gameIdOrTitle.toLowerCase().trim()

  // Match by exact otixGameId or preset id
  const byId = GAME_SERVER_PRESETS.filter(
    (p) => p.id === cleaned || p.otixGameId?.toLowerCase() === cleaned,
  )
  if (byId.length > 0) return byId

  // Match by exact title
  const byExactTitle = GAME_SERVER_PRESETS.filter(
    (p) => p.name.toLowerCase() === cleaned || p.gameTitle.toLowerCase() === cleaned,
  )
  if (byExactTitle.length > 0) return byExactTitle

  // Match by substring / keyword
  return GAME_SERVER_PRESETS.filter(
    (p) =>
      cleaned.includes(p.gameTitle.toLowerCase()) ||
      p.gameTitle.toLowerCase().includes(cleaned) ||
      (p.otixGameId && cleaned.includes(p.otixGameId.toLowerCase())),
  )
}

/**
 * Calculate expected query port when the game port changes for a preset with an offset.
 */
export const calculateQueryPort = (preset: GameServerPreset | undefined, currentPort: number): string => {
  if (!preset) return ''
  if (preset.queryPortOffset != null) {
    return String(currentPort + preset.queryPortOffset)
  }
  if (preset.defaultQueryPort != null) {
    return String(preset.defaultQueryPort)
  }
  return ''
}

export interface PresetCategoryGroup {
  category: string
  presets: GameServerPreset[]
}

/**
 * Group presets by category in insertion order.
 */
export const getPresetsByCategory = (): PresetCategoryGroup[] => {
  const groups: PresetCategoryGroup[] = []
  const categoryMap = new Map<string, GameServerPreset[]>()

  for (const preset of GAME_SERVER_PRESETS) {
    const category = preset.category || 'Other'
    let list = categoryMap.get(category)
    if (!list) {
      list = []
      categoryMap.set(category, list)
      groups.push({ category, presets: list })
    }
    list.push(preset)
  }

  return groups
}

/**
 * Get game artwork/icon URL for a preset.
 * Uses explicit iconUrl, or Steam CDN capsule thumbnail if steamAppId is present.
 */
export const getPresetIconUrl = (preset?: GameServerPreset | null): string | null => {
  if (!preset) return null
  if (preset.iconUrl) return preset.iconUrl
  if (preset.steamAppId) {
    return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${preset.steamAppId}/capsule_sm_120.jpg`
  }
  return null
}

export interface SupportedOtixGameOption {
  otixGameId: string
  gameTitle: string
  iconUrl: string | null
  presets: GameServerPreset[]
}

/**
 * Get distinct list of supported Otix games for linking.
 */
export const getSupportedOtixGames = (): SupportedOtixGameOption[] => {
  const map = new Map<string, SupportedOtixGameOption>()

  for (const preset of GAME_SERVER_PRESETS) {
    const key = preset.otixGameId || preset.id
    let entry = map.get(key)
    if (!entry) {
      entry = {
        otixGameId: key,
        gameTitle: preset.gameTitle || preset.name,
        iconUrl: getPresetIconUrl(preset),
        presets: [],
      }
      map.set(key, entry)
    }
    entry.presets.push(preset)
  }

  return Array.from(map.values())
}
