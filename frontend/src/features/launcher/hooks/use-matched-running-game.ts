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
}

export function cleanGameTitle(rawTitle: string, exePath?: string): string {
  const filename = (exePath || rawTitle || '').split(/[/\\]/).pop()?.toLowerCase() || ''
  if (KNOWN_GAME_SIGNATURES[filename]) {
    return KNOWN_GAME_SIGNATURES[filename]
  }

  const cleanedFilename = filename
    .replace(/\.exe$/i, '')
    .replace(/\.bin$/i, '')
    .replace(/\.iso$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/_shipping$/i, '')

  if (KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]) {
    return KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]
  }

  let title = rawTitle || cleanedFilename
  title = title
    .replace(/\.exe$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/[._-]+/g, ' ')
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
  const otixMediaId = runningGame?.game.otixMediaId || (runningGame?.game.id && /^\d+$/.test(runningGame.game.id) ? runningGame.game.id : '')
  const cleanedTitle = useMemo(() => cleanGameTitle(rawTitle, exePath), [rawTitle, exePath])

  const { data: matchedGame, isLoading: isMatching } = useQuery<MatchedGameInfo | null>({
    queryKey: ['running-game-matched', otixMediaId || cleanedTitle],
    queryFn: async () => {
      // 1. Direct fetch if otixMediaId is known
      if (otixMediaId) {
        try {
          const { data } = await apiClient.get<MediaItemDetail>(`/media/game/${otixMediaId}`)
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

      // 2. Search catalog by title
      try {
        interface SearchItem {
          id: string
          title: string
          slug: string
          posterUrl: string | null
          backdropUrl: string | null
          releaseDate: string | null
          avgRating?: number | null
        }
        const { data: searchData } = await apiClient.get<{ items: SearchItem[] }>(
          '/search',
          { params: { q: cleanedTitle, media_type: 'game', page_size: 5 } },
        )

        const items = searchData?.items || []
        if (items.length === 0) return null

        // Pick exact match if available, else first item
        const exact = items.find((i) => i.title.toLowerCase() === cleanedTitle.toLowerCase()) || items[0]

        // Fetch detail for genres and developer
        try {
          const { data: detail } = await apiClient.get<MediaItemDetail>(`/media/game/${exact.id}`)
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
          return {
            id: exact.id,
            title: exact.title,
            slug: exact.slug,
            posterUrl: exact.posterUrl,
            backdropUrl: exact.backdropUrl,
            releaseDate: exact.releaseDate,
            rating: exact.avgRating ?? null,
          }
        }
      } catch {
        return null
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
