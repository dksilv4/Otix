import { cleanGameTitle } from '@/features/launcher/hooks/use-matched-running-game'

// High-confidence map of common titles/slugs to official Steam AppIDs
// Steam CDN provides instant, ultra-high resolution public assets with 0 auth/rate limits
export const KNOWN_STEAM_APP_IDS: Record<string, string> = {
  'factorio': '427520',
  'control': '870780',
  'grounded': '962130',
  'bloons td 6': '960090',
  'cyberpunk 2077': '1091500',
  "baldur's gate 3": '1086940',
  'baldurs gate 3': '1086940',
  'elden ring': '1245620',
  'hades': '1145360',
  'hades ii': '1145350',
  'hades 2': '1145350',
  'black myth: wukong': '2358720',
  'black myth wukong': '2358720',
  'helldivers 2': '553850',
  'starfield': '1716740',
  'grand theft auto v': '271590',
  'gta v': '271590',
  'gta 5': '271590',
  'red dead redemption 2': '1174180',
  'rdr2': '1174180',
  'the witcher 3: wild hunt': '292030',
  'the witcher 3': '292030',
  'witcher 3': '292030',
  'warhammer 40,000: space marine 2': '2183900',
  'space marine 2': '2183900',
  'palworld': '1623730',
  'apex legends': '1172470',
  'counter-strike 2': '730',
  'cs2': '730',
  'dota 2': '570',
  'monster hunter: world': '582010',
  'monster hunter world': '582010',
  'monster hunter rise': '1446780',
  'hollow knight': '367520',
  'stardew valley': '413150',
  'dead cells': '588650',
  'slay the spire': '646570',
  'balatro': '2379780',
  'rust': '252490',
  'god of war': '1593500',
  'sekiro: shadows die twice': '814380',
  'sekiro': '814380',
  'dark souls iii': '374320',
  'dark souls 3': '374320',
  'forza horizon 5': '1551360',
  'hogwarts legacy': '990080',
  'destiny 2': '1085660',
  'overwatch 2': '2357570',
  'fallout 4': '377160',
  'the elder scrolls v: skyrim': '489830',
  'skyrim': '489830',
  'valheim': '892970',
  'rocket league': '252950',
  'dead by daylight': '381210',
  'terraria': '105600',
  'rimworld': '294100',
  'subnautica': '264710',
  'deep rock galactic': '548430',
}

export interface GameResolvedArtwork {
  posterUrl: string | null
  bannerUrl: string | null
  backdropUrl: string | null
  cleanedTitle: string
  appId?: string | null
}

export function getSteamCdnUrls(appId: string) {
  const base = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`
  return {
    posterUrl: `${base}/library_600x900.jpg`,
    bannerUrl: `${base}/header.jpg`,
    backdropUrl: `${base}/page_bg_generated_v6b.jpg`,
  }
}

/**
 * Resolves artwork (poster, banner, backdrop) for any game session using:
 * 1. Explicit artwork in session
 * 2. Steam App ID extracted from gameId (e.g. "steam_427520", "960090")
 * 3. Title match against known game signature & Steam database
 */
export function resolveSessionArtwork(
  gameId: string,
  rawTitle: string,
  processName?: string,
  existingPoster?: string | null,
  existingBackdrop?: string | null
): GameResolvedArtwork {
  const cleanedTitle = cleanGameTitle(rawTitle, processName)

  // 1. If explicit poster already exists and is non-empty
  if (existingPoster && existingPoster.length > 5) {
    return {
      posterUrl: existingPoster,
      bannerUrl: existingBackdrop || existingPoster,
      backdropUrl: existingBackdrop || existingPoster,
      cleanedTitle,
    }
  }

  // 2. Check if gameId is a Steam AppID directly (e.g. "steam_427520" or "427520")
  const steamMatch = gameId.match(/^steam_(\d+)$/i) || gameId.match(/^(\d{4,9})$/)
  if (steamMatch) {
    const appId = steamMatch[1]
    const steamUrls = getSteamCdnUrls(appId)
    return {
      ...steamUrls,
      cleanedTitle,
      appId,
    }
  }

  // 3. Match by cleaned title or raw title
  const normTitle = cleanedTitle.toLowerCase().trim()
  const normRaw = rawTitle.toLowerCase().trim()
  const appId = KNOWN_STEAM_APP_IDS[normTitle] || KNOWN_STEAM_APP_IDS[normRaw]

  if (appId) {
    const steamUrls = getSteamCdnUrls(appId)
    return {
      ...steamUrls,
      cleanedTitle,
      appId,
    }
  }

  return {
    posterUrl: existingPoster || null,
    bannerUrl: existingBackdrop || null,
    backdropUrl: existingBackdrop || null,
    cleanedTitle,
  }
}
