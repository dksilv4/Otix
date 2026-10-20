import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useRunningGame } from './use-running-game'
import type { RunningGameData } from '@/lib/desktop/api'
import type { MediaItemDetail } from '@/features/media/queries/media-queries'

export interface MatchedGameInfo {
  id: string
  title: string
  slug?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  releaseDate?: string | null
  genres?: string[]
  developer?: string | null
  rating?: number | null
  overview?: string | null
}

const KNOWN_GAME_SIGNATURES: Record<string, string> = {
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'witcher3.exe': 'The Witcher 3: Wild Hunt',
  'gta5.exe': 'Grand Theft Auto V',
  'rdr2.exe': 'Red Dead Redemption 2',
  'eldenring.exe': 'Elden Ring',
  'starfield.exe': 'Starfield',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'baldursgate3.exe': "Baldur's Gate 3",
  'hogwartslegacy.exe': 'Hogwarts Legacy',
  'forzahorizon5.exe': 'Forza Horizon 5',
  'monsterhunterworld.exe': 'Monster Hunter: World',
  'monsterhunterrise.exe': 'Monster Hunter Rise',
  'cs2.exe': 'Counter-Strike 2',
  'csgo.exe': 'Counter-Strike: Global Offensive',
  'dota2.exe': 'Dota 2',
  'valorant.exe': 'Valorant',
  'valorant-win64-shipping.exe': 'Valorant',
  'leagueclient.exe': 'League of Legends',
  'destiny2.exe': 'Destiny 2',
  'overwatch.exe': 'Overwatch 2',
  'r5apex.exe': 'Apex Legends',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'rocketleague.exe': 'Rocket League',
  'deadbydaylight.exe': 'Dead by Daylight',
  'helldivers2.exe': 'Helldivers 2',
  'palworld-win64-shipping.exe': 'Palworld',
  'blackmythwukong.exe': 'Black Myth: Wukong',
  'b1-win64-shipping.exe': 'Black Myth: Wukong',
  'spacemarine2.exe': 'Warhammer 40,000: Space Marine 2',
  'warhammer3.exe': 'Total War: Warhammer III',
  'civ6.exe': "Sid Meier's Civilization VI",
  'civ7.exe': "Sid Meier's Civilization VII",
  'civ7_win64_dx12_finalrelease.exe': "Sid Meier's Civilization VII",
  'sekiro.exe': 'Sekiro: Shadows Die Twice',
  'darksoulsiii.exe': 'Dark Souls III',
  'armoredcore6.exe': 'Armored Core VI: Fires of Rubicon',
  'godofwar.exe': 'God of War',
  'gow_ragnarok.exe': 'God of War Ragnarök',
  'spiderman.exe': "Marvel's Spider-Man Remastered",
  'milesmorales.exe': "Marvel's Spider-Man: Miles Morales",
  'tlou-i.exe': 'The Last of Us Part I',
  'ghostotsushima.exe': 'Ghost of Tsushima',
  'horizonzerodawn.exe': 'Horizon Zero Dawn',
  'horizonforbiddenwest.exe': 'Horizon Forbidden West',
  'residentevil4.exe': 'Resident Evil 4',
  're4.exe': 'Resident Evil 4',
  're8.exe': 'Resident Evil Village',
  'fallout4.exe': 'Fallout 4',
  'skyrimse.exe': 'The Elder Scrolls V: Skyrim',
  'hades.exe': 'Hades',
  'hades2.exe': 'Hades II',
  'hollow_knight.exe': 'Hollow Knight',
  'silksong.exe': 'Hollow Knight: Silksong',
  'valheim.exe': 'Valheim',
  'stardew valley.exe': 'Stardew Valley',
  'stardewvalley.exe': 'Stardew Valley',
  'deadcells.exe': 'Dead Cells',
  'slaythespire.exe': 'Slay the Spire',
  'balatro.exe': 'Balatro',
  // Popular titles & user library entries
  'bloonstd6.exe': 'Bloons TD 6',
  'bloonstd6': 'Bloons TD 6',
  'cleaner-btd6.exe': 'Bloons TD 6',
  'btd6.exe': 'Bloons TD 6',
  'factorygamesteam.exe': 'Satisfactory',
  'satisfactory.exe': 'Satisfactory',
  'modernwarfare.exe': 'Call of Duty: Modern Warfare',
  'supermarket together.exe': 'Supermarket Together',
  'supermarkettogether.exe': 'Supermarket Together',
  'rs2client.exe': 'RuneScape',
  'runescape.exe': 'RuneScape',
  'rsdragonwilds.exe': 'RuneScape Dragonwilds',
  'rsdragonwilds-win64-shipping.exe': 'RuneScape Dragonwilds',
  'oriwotw.exe': 'Ori and the Will of the Wisps',
  'oride.exe': 'Ori and the Blind Forest',
  'timberborn.exe': 'Timberborn',
  'pragmata.exe': 'Pragmata',
  'brawlhalla.exe': 'Brawlhalla',
  'pathofexilesteam.exe': 'Path of Exile 2',
  'pathofexile.exe': 'Path of Exile',
  'pathofexile_x64.exe': 'Path of Exile',
  'pathofexile2.exe': 'Path of Exile 2',
  'losslessscaling.exe': 'Lossless Scaling',
  'transportfever3.exe': 'Transport Fever 3',
  'transportfever2.exe': 'Transport Fever 2',
  'whiskerwood.exe': 'Whiskerwood',
  'whiskerwood-win64-shipping.exe': 'Whiskerwood',
  'ultimatechickenhorse.exe': 'Ultimate Chicken Horse',
  'tekken 8.exe': 'Tekken 8',
  'tekken8.exe': 'Tekken 8',
  'risk of rain 2.exe': 'Risk of Rain 2',
  'riskofrain2.exe': 'Risk of Rain 2',
  'wardogs.exe': 'Wardogs',
  'wardogsclient.exe': 'Wardogs',
  'wardogsclient-win64-shipping.exe': 'Wardogs',
  'wardogslauncher-shipping.exe': 'Wardogs',
  'wardogs-win64-shipping.exe': 'Wardogs',
  'subnautica.exe': 'Subnautica',
  'factorio.exe': 'Factorio',
  'terraria.exe': 'Terraria',
}

function splitWordBoundaries(text: string): string {
  return text
    // CamelCase: "BloonsTD" -> "Bloons TD"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Acronym followed by capitalized word: "BTDGame" -> "BTD Game"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Letter followed by digits: "TD6" -> "TD 6", "Witcher3" -> "Witcher 3" (preserve v1, v2 version tags)
    .replace(/([a-uw-zA-UW-Z])([0-9]+)/g, '$1 $2')
    // Digits followed by letters: "2Fast" -> "2 Fast"
    .replace(/([0-9]+)([a-zA-Z])/g, '$1 $2')
}

export function cleanGameTitle(rawTitle: string, exePath?: string): string {
  const filename = (exePath || rawTitle || '').split(/[/\\]/).pop()?.toLowerCase() || ''
  if (KNOWN_GAME_SIGNATURES[filename]) {
    return KNOWN_GAME_SIGNATURES[filename]
  }

  // Check parent directory name if exePath is provided
  if (exePath) {
    const parts = exePath.split(/[/\\]/).filter(Boolean)
    if (parts.length >= 2) {
      const parentDir = parts[parts.length - 2].toLowerCase()
      if (KNOWN_GAME_SIGNATURES[parentDir]) {
        return KNOWN_GAME_SIGNATURES[parentDir]
      }
      if (KNOWN_GAME_SIGNATURES[`${parentDir}.exe`]) {
        return KNOWN_GAME_SIGNATURES[`${parentDir}.exe`]
      }
    }
  }

  const cleanedFilename = filename
    .replace(/\.exe$/i, '')
    .replace(/\.bin$/i, '')
    .replace(/\.iso$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/_shipping$/i, '')
    .replace(/-shipping$/i, '')
    .replace(/_x64$/i, '')
    .replace(/_win64$/i, '')
    .replace(/client$/i, '')
    .replace(/launcher$/i, '')

  if (KNOWN_GAME_SIGNATURES[cleanedFilename]) {
    return KNOWN_GAME_SIGNATURES[cleanedFilename]
  }
  if (KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]) {
    return KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]
  }

  // Use the best base title: prefer parent folder if rawTitle looks like a generic file ID
  let title = rawTitle || cleanedFilename
  if (/^file_[a-f0-9]+$/i.test(title) && exePath) {
    const parts = exePath.split(/[/\\]/).filter(Boolean)
    if (parts.length >= 2) {
      title = parts[parts.length - 2]
    }
  }

  title = title
    .replace(/\.exe$/i, '')
    .replace(/\.iso$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/_shipping$/i, '')
    .replace(/-shipping$/i, '')
    .replace(/_x64$/i, '')
    .replace(/_win64$/i, '')
    .replace(/client$/i, '')
    .replace(/launcher$/i, '')
    .replace(/-voices\d*$/i, '')
    .replace(/-i know$/i, '')
    .replace(/-razor1911$/i, '')
    .replace(/[._-]+/g, ' ')

  // Split word boundaries (e.g., BloonsTD6 -> Bloons TD 6)
  title = splitWordBoundaries(title)

  // Normalize common Roman numerals and abbreviations
  title = title
    .replace(/\btd\b/gi, 'TD')
    .replace(/\bii\b/gi, 'II')
    .replace(/\biii\b/gi, 'III')
    .replace(/\biv\b/gi, 'IV')
    .replace(/\bvi\b/gi, 'VI')
    .replace(/\bvii\b/gi, 'VII')
    .replace(/\bviii\b/gi, 'VIII')
    .replace(/\s+/g, ' ')
    .trim()

  return title
}

export function useMatchedRunningGame(): {
  runningGame: RunningGameData | null
  elapsedMs: number
  matchedGame: MatchedGameInfo | null
  isMatching: boolean
} {
  const { runningGame, elapsedMs } = useRunningGame()

  const rawTitle = runningGame?.game.title || ''
  const exePath = runningGame?.game.exePath || ''
  const otixMediaId = runningGame?.game.otixMediaId || (runningGame?.game.id && !/^file_/i.test(runningGame.game.id) ? runningGame.game.id : '')
  const cleanedTitle = useMemo(() => cleanGameTitle(rawTitle, exePath), [rawTitle, exePath])

  const { data: matchedGame, isLoading: isMatching } = useQuery<MatchedGameInfo | null>({
    queryKey: ['running-game-matched', otixMediaId || cleanedTitle],
    queryFn: async () => {
      // 1. Direct fetch if otixMediaId is known
      if (otixMediaId) {
        try {
          const { data } = await apiClient.get<MediaItemDetail>(`/media/game/${otixMediaId}`, {
            signal: AbortSignal.timeout(4000),
          })
          if (data) {
            const dev = data.involvedCompanies?.find((c) => c.developer)?.company?.name
            return {
              id: data.id,
              title: data.title,
              slug: data.slug,
              posterUrl: data.posterUrl,
              backdropUrl: data.backdropUrl,
              releaseDate: data.releaseDate,
              genres: data.genres?.map((g) => g.name),
              developer: dev || data.involvedCompanies?.[0]?.company?.name || null,
              rating: data.avgRating ?? data.overallRating ?? null,
              overview: data.overview,
            }
          }
        } catch {
          // fall back to search
        }
      }

      if (!cleanedTitle) return null

      // 2. Search catalog by title with smart fallbacks
      interface SearchItem {
        id: string
        title: string
        slug: string
        posterUrl: string | null
        backdropUrl: string | null
        releaseDate: string | null
        avgRating?: number | null
        overview?: string | null
        genres?: Array<{ id: number; name: string } | string>
      }

      const searchQueries = [cleanedTitle]

      // Fallback 1: If exePath has a folder name different from cleanedTitle
      if (exePath) {
        const parts = exePath.split(/[/\\]/).filter(Boolean)
        if (parts.length >= 2) {
          const folderClean = cleanGameTitle(parts[parts.length - 2])
          if (folderClean && !searchQueries.includes(folderClean)) {
            searchQueries.push(folderClean)
          }
        }
      }

      // Fallback 2: Strip trailing numbers or edition markers
      const strippedNumbers = cleanedTitle.replace(/\s+\d+$/, '').trim()
      if (strippedNumbers && !searchQueries.includes(strippedNumbers)) {
        searchQueries.push(strippedNumbers)
      }

      // Fallback 3: Try raw title if distinct
      if (rawTitle && !searchQueries.includes(rawTitle) && !/^file_/i.test(rawTitle)) {
        searchQueries.push(rawTitle)
      }

      for (const query of searchQueries) {
        try {
          const { data: searchData } = await apiClient.get<{ items: SearchItem[] }>(
            '/search',
            { params: { q: query, media_type: 'game', page_size: 5 } },
          )

          const items = searchData?.items || []
          if (items.length === 0) continue

          // Pick exact match or closest, else first item
          const exact = items.find((i) => i.title.toLowerCase() === cleanedTitle.toLowerCase())
            || items.find((i) => i.title.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanedTitle.toLowerCase().replace(/[^a-z0-9]/g, ''))
            || items[0]

          // If exact.id is a numeric database ID, attempt to fetch richer details (genres & dev)
          if (/^\d+$/.test(exact.id)) {
            try {
              const { data: detail } = await apiClient.get<MediaItemDetail>(`/media/game/${exact.id}`, {
                signal: AbortSignal.timeout(3000),
              })
              const dev = detail.involvedCompanies?.find((c) => c.developer)?.company?.name
              return {
                id: detail.id,
                title: detail.title,
                slug: detail.slug,
                posterUrl: detail.posterUrl,
                backdropUrl: detail.backdropUrl,
                releaseDate: detail.releaseDate,
                genres: detail.genres?.map((g) => g.name),
                developer: dev || detail.involvedCompanies?.[0]?.company?.name || null,
                rating: detail.avgRating ?? detail.overallRating ?? null,
                overview: detail.overview,
              }
            } catch {
              // Fall through to exact search item
            }
          }

          // Hydrate directly from the search item (contains full poster, backdrop, overview, ratings)
          const searchGenres = exact.genres?.map((g) => (typeof g === 'string' ? g : g.name))
          return {
            id: exact.id,
            title: exact.title,
            slug: exact.slug,
            posterUrl: exact.posterUrl,
            backdropUrl: exact.backdropUrl,
            releaseDate: exact.releaseDate,
            genres: searchGenres,
            rating: exact.avgRating ?? null,
            overview: exact.overview || null,
          }
        } catch {
          // Try next fallback query
        }
      }

      // Fallback if not in search catalog: return cleaned title and any local artwork
      return {
        id: runningGame?.game.id || '',
        title: cleanedTitle || rawTitle,
        posterUrl: runningGame?.game.posterUrl || null,
        backdropUrl: null,
      }
    },
    enabled: Boolean(runningGame && (otixMediaId || cleanedTitle)),
    staleTime: 1000 * 60 * 15,
  })

  return {
    runningGame,
    elapsedMs,
    matchedGame: matchedGame || null,
    isMatching,
  }
}
