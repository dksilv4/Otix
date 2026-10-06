import { apiClient } from '@/lib/api/client'

// Fetch every page of a cursor-paginated library endpoint (matched + unmatched).
export const fetchAllLibraryPages = async (path: string): Promise<any[]> => {
  const items: any[] = []
  let cursor: string | null = null
  for (let i = 0; i < 50; i++) {
    const params: Record<string, string> = { limit: '100' }
    if (cursor) params.cursor = cursor
    const { data } = await apiClient.get<any>(path, { params })
    items.push(...(data?.items ?? []))
    if (!data?.hasMore || !data?.nextCursor) break
    cursor = data.nextCursor
  }
  return items
}

export const mapInstalledGame = (item: any): any => {
  const suggestionId = item.matchSuggestionMediaId || item.match_suggestion_media_id
  return {
    id: `installed-${item.id}`,
    title: item.title,
    posterUrl: item.catalogPosterUrl || item.catalog_poster_url || item.catalogTextlessPosterUrl || item.catalog_textless_poster_url || null,
    localIconUrl: item.catalogLogoUrl || item.catalog_logo_url || null,
    iconUrl: item.catalogLogoUrl || item.catalog_logo_url || null,
    otixMediaId: item.mediaItemId || item.media_item_id,
    platform: item.platform || 'pc',
    providerName: item.platform || 'pc',
    gameType: 'main_game',
    mediaType: 'game',
    developer: null,
    lastPlayedAt: item.lastSeenAt || item.last_seen_at || null,
    otixMatchSuggestion: suggestionId ? { id: suggestionId } : undefined,
  }
}

export const fetchInstalledGames = async (): Promise<any[]> => {
  const { data } = await apiClient.get<any>('/library/installed', { params: { limit: 200 } })
  return (data?.games ?? []).map(mapInstalledGame)
}

// Map a matched Steam MediaItemSummary to the page's local-game shape.
export const mapSteamMatched = (item: any): any => {
  return {
    id: `steam-${item.id}`,
    title: item.title,
    posterUrl: item.posterUrl || item.textlessPosterUrl || item.iconUrl || null,
    localIconUrl: item.iconUrl || null,
    iconUrl: item.iconUrl || null,
    otixMediaId: item.id,
    platform: 'steam',
    providerName: 'steam',
    gameType: 'main_game',
    mediaType: item.mediaType || 'game',
    developer: null,
    steamPlaytimeForever: item.steamPlaytimeForever,
    steamPlaytime2weeks: item.steamPlaytime2weeks,
    steamRtimeLastPlayed: item.steamRtimeLastPlayed,
    isSteam: true,
  }
}

// Map an unmatched SteamUnmatchedGameSummary to the page's local-game shape.
export const mapSteamUnmatched = (item: any): any => {
  const iconUrl = item.steamImgIconUrl
    ? `https://media.steampowered.com/steamcommunity/public/images/apps/${item.steamAppId}/${item.steamImgIconUrl}.jpg`
    : null
  return {
    id: `steam-unmatched-${item.id}`,
    title: item.steamName,
    posterUrl: null,
    localIconUrl: iconUrl,
    iconUrl,
    otixMediaId: undefined,
    platform: 'steam',
    providerName: 'steam',
    gameType: 'main_game',
    mediaType: 'game',
    developer: null,
    steamAppId: item.steamAppId,
    steamPlaytimeForever: item.steamPlaytimeForever,
    steamPlaytime2weeks: item.steamPlaytime2weeks,
    steamRtimeLastPlayed: item.steamRtimeLastPlayed,
    isSteam: true,
  }
}

// Map a matched Epic MediaItemSummary to the page's local-game shape.
export const mapEpicMatched = (item: any): any => {
  return {
    id: `epic-${item.id}`,
    title: item.title,
    posterUrl: item.posterUrl || item.textlessPosterUrl || item.iconUrl || null,
    localIconUrl: item.iconUrl || null,
    iconUrl: item.iconUrl || null,
    otixMediaId: item.id,
    platform: 'epic',
    providerName: 'epic',
    gameType: 'main_game',
    mediaType: item.mediaType || 'game',
    developer: null,
    isEpic: true,
  }
}

// Map an unmatched Epic game to the page's local-game shape.
export const mapEpicUnmatched = (item: any): any => {
  return {
    id: `epic-unmatched-${item.id}`,
    title: item.epicName || item.epic_name || item.title,
    posterUrl: null,
    localIconUrl: null,
    iconUrl: null,
    otixMediaId: undefined,
    platform: 'epic',
    providerName: 'epic',
    gameType: 'main_game',
    mediaType: 'game',
    developer: null,
    epicAppName: item.appName || item.app_name,
    isEpic: true,
  }
}

// Map a matched GOG MediaItemSummary to the page's local-game shape.
export const mapGOGMatched = (item: any): any => {
  return {
    id: `gog-${item.id}`,
    title: item.title,
    posterUrl: item.posterUrl || item.textlessPosterUrl || item.iconUrl || null,
    localIconUrl: item.iconUrl || null,
    iconUrl: item.iconUrl || null,
    otixMediaId: item.id,
    platform: 'gog',
    providerName: 'gog',
    gameType: 'main_game',
    mediaType: item.mediaType || 'game',
    developer: null,
    isGOG: true,
  }
}

// Map an unmatched GOG game to the page's local-game shape.
export const mapGOGUnmatched = (item: any): any => {
  return {
    id: `gog-unmatched-${item.id}`,
    title: item.title,
    posterUrl: item.image || null,
    localIconUrl: item.image || null,
    iconUrl: item.image || null,
    otixMediaId: undefined,
    platform: 'gog',
    providerName: 'gog',
    gameType: 'main_game',
    mediaType: 'game',
    developer: null,
    gogGameId: item.gameId || item.game_id,
    isGOG: true,
  }
}

// Clean title for fuzzy deduplication across editions, regional titles, playtests, betas, and servers.
export const cleanTitleForDeduplication = (title: string): string => {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/^(a\.v\.a\.?|ava)\s*/i, '')
    .replace(/\s*[-([{].*?[)\]}]/g, '')
    .replace(/[-:\s]+(playtest|test server|public test server|closed beta|open beta|beta|alpha|demo|global|server|pts|trial|client|sdk|edition|goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|vr|directors? cut)\b.*/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Deduplicate games from local disk scan and backend API endpoints.
export const deduplicateGames = (items: any[]): any[] => {
  const merged: any[] = []
  const seenIds = new Set<string>()
  const seenMediaIds = new Set<string>()
  const seenSteamAppIds = new Set<string>()
  const titleMap = new Map<string, any>()

  for (const item of items) {
    if (!item) continue

    const mediaId = item.otixMediaId ? String(item.otixMediaId) : null
    const steamAppId = item.steamAppId
      ? String(item.steamAppId)
      : item.id?.startsWith?.('steam-')
      ? item.id.replace('steam-', '').replace('unmatched-', '')
      : null

    const normTitle = cleanTitleForDeduplication(item.title)
    const isSteam = item.isSteam || item.platform === 'steam' || item.providerName === 'steam'
    const platKey = isSteam ? 'steam' : (item.platform || item.providerName || 'pc').toLowerCase()
    // Group by normalized title across PC/Steam platforms to collapse regional, beta, playtest, and edition duplicates
    const titleKey = isSteam || platKey === 'pc' || platKey === 'win32' ? normTitle : `${normTitle}:${platKey}`

    let existing: any = null

    if (item.id && seenIds.has(item.id)) {
      existing = merged.find((m) => m.id === item.id)
    } else if (mediaId && seenMediaIds.has(mediaId)) {
      existing = merged.find((m) => String(m.otixMediaId) === mediaId)
    } else if (steamAppId && seenSteamAppIds.has(steamAppId)) {
      existing = merged.find((m) => {
        const mSteamAppId = m.steamAppId
          ? String(m.steamAppId)
          : m.id?.startsWith?.('steam-')
          ? m.id.replace('steam-', '').replace('unmatched-', '')
          : null
        return mSteamAppId === steamAppId
      })
    } else if (normTitle && titleMap.has(titleKey)) {
      existing = titleMap.get(titleKey)
    }

    if (existing) {
      if (!existing.otixMediaId && item.otixMediaId) {
        existing.otixMediaId = item.otixMediaId
      }
      if (!existing.posterUrl && item.posterUrl) {
        existing.posterUrl = item.posterUrl
      }
      if (!existing.localIconUrl && item.localIconUrl) {
        existing.localIconUrl = item.localIconUrl
      }
      if (!existing.iconUrl && item.iconUrl) {
        existing.iconUrl = item.iconUrl
      }
      if (!existing.exePath && item.exePath) {
        existing.exePath = item.exePath
      }
      if (!existing.steamAppId && item.steamAppId) {
        existing.steamAppId = item.steamAppId
      }
      if (item.steamPlaytimeForever && (!existing.steamPlaytimeForever || item.steamPlaytimeForever > existing.steamPlaytimeForever)) {
        existing.steamPlaytimeForever = item.steamPlaytimeForever
      }
      if (item.steamRtimeLastPlayed && (!existing.steamRtimeLastPlayed || item.steamRtimeLastPlayed > existing.steamRtimeLastPlayed)) {
        existing.steamRtimeLastPlayed = item.steamRtimeLastPlayed
      }
      if (!existing.otixMatchSuggestion && item.otixMatchSuggestion) {
        existing.otixMatchSuggestion = item.otixMatchSuggestion
      }
      if ((item.otixMediaId && !existing.otixMediaId) || (!existing.otixMediaId && item.title && item.title.length < existing.title.length)) {
        existing.title = item.title
      }
    } else {
      const newItem = { ...item }
      merged.push(newItem)
      if (newItem.id) seenIds.add(newItem.id)
      if (mediaId) seenMediaIds.add(mediaId)
      if (steamAppId) seenSteamAppIds.add(steamAppId)
      if (normTitle) titleMap.set(titleKey, newItem)
    }
  }

  return merged
}
