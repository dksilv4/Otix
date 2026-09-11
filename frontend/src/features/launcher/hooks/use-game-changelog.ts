import { useQuery } from '@tanstack/react-query'
import type { LocalGame, DisplayGame } from '@/features/launcher/types'
import type { GameChangelogItem, GameVersionInfo } from '@/features/launcher/types/launcher-changelog'
import { useGame } from '@/features/launcher/data/queries'

// Common popular PC titles mapped to Steam App IDs for instant resolution
const KNOWN_TITLE_TO_STEAM_ID: Record<string, number> = {
  'cyberpunk 2077': 1091500,
  'baldur\'s gate 3': 1086940,
  'baldurs gate 3': 1086940,
  'the witcher 3: wild hunt': 292030,
  'the witcher 3': 292030,
  'elden ring': 1245620,
  'portal 2': 620,
  'portal': 400,
  'half-life 2': 220,
  'grand theft auto v': 271590,
  'gta v': 271590,
  'hades': 1145360,
  'hollow knight': 367520,
  'stardew valley': 413150,
  'terraria': 105600,
  'red dead redemption 2': 1174180,
  'god of war': 1593500,
  'spider-man remastered': 1817070,
  'marvel\'s spider-man remastered': 1817070,
  'forza horizon 5': 1551360,
  'dead cells': 588650,
  'celeste': 504230,
  'sekiro: shadows die twice': 814380,
  'sekiro': 814380,
  'monster hunter: world': 582010,
  'subnautica': 264710,
  'helldivers 2': 553850,
  'palworld': 1623730,
}

/** Clean BBCode, HTML, and extra whitespace from Steam news contents. */
function cleanChangelogText(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[url=[^\]]*\](.*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?(b|i|u|h1|h2|h3|h4|quote|list|\*|previewyoutube|table|tr|td|th|code)\]/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extract a version string like v1.0.4 or Patch 1.2 from title or body. */
function extractVersion(text: string): string | undefined {
  const match = text.match(/\b(?:v|version|patch|build)\s*(\d+(?:\.\d+)+[a-z]?)/i)
  if (match) return `v${match[1]}`
  const patchMatch = text.match(/\bpatch\s*(?:#|no\.?)?\s*(\d+)/i)
  if (patchMatch) return `Patch ${patchMatch[1]}`
  return undefined
}

/** Determine whether an announcement represents a version update or patch. */
function isPatchNoteItem(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase()
  return (
    text.includes('patch') ||
    text.includes('update') ||
    text.includes('hotfix') ||
    text.includes('notes') ||
    text.includes('changelog') ||
    text.includes('version') ||
    /\bv\d+\.\d+/.test(text) ||
    text.includes('release')
  )
}

/** Resolve the Steam App ID from game properties, catalog, or title dictionary. */
export function resolveSteamAppId(game: LocalGame | DisplayGame | null, catalogSteamId?: number | null): number | null {
  if (!game) return null

  // 1. Direct platform id if numeric
  if (game.platform === 'steam' && /^\d+$/.test(game.id)) {
    return Number(game.id)
  }

  // 2. Already resolved catalog steamAppId
  if (catalogSteamId && catalogSteamId > 0) {
    return catalogSteamId
  }

  // 3. Raw game data
  const raw = ('rawGame' in game && game.rawGame ? game.rawGame : game) as LocalGame
  if (raw.data?.steamAppId) {
    return raw.data.steamAppId
  }

  // 4. Check title against known dictionary
  const normalizedTitle = (raw.data?.title || raw.title || '').trim().toLowerCase()
  if (KNOWN_TITLE_TO_STEAM_ID[normalizedTitle]) {
    return KNOWN_TITLE_TO_STEAM_ID[normalizedTitle]
  }

  for (const [key, id] of Object.entries(KNOWN_TITLE_TO_STEAM_ID)) {
    if (normalizedTitle.includes(key) || key.includes(normalizedTitle)) {
      return id
    }
  }

  return null
}

export function useGameChangelog(game: LocalGame | DisplayGame | null) {
  const raw = (game && 'rawGame' in game && game.rawGame ? game.rawGame : game) as LocalGame | null
  const mediaId = raw?.otixMediaId || raw?.data?.id
  const { data: catalogDetail } = useGame(mediaId)

  const steamAppId = resolveSteamAppId(game, catalogDetail?.steamAppId)

  return useQuery<{
    changelogs: GameChangelogItem[]
    versionInfo: GameVersionInfo
  }>({
    queryKey: ['game-changelog', game?.id, steamAppId, raw?.updateFiles?.length],
    queryFn: async () => {
      const localFiles = raw?.updateFiles || []
      const localVersions = localFiles
        .map((f) => extractVersion(f.name))
        .filter((v): v is string => Boolean(v))

      let items: GameChangelogItem[] = []

      // If we have a Steam App ID, fetch official announcements / patch notes
      if (steamAppId) {
        try {
          const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${steamAppId}&count=15&maxlength=1200&feeds=steam_community_announcements`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            const newsitems = data?.appnews?.newsitems || []
            items = newsitems.map((n: any) => {
              const cleaned = cleanChangelogText(n.contents)
              const version = extractVersion(`${n.title} ${cleaned}`)
              return {
                id: n.gid || String(n.date),
                title: n.title,
                version,
                date: n.date,
                content: cleaned,
                author: n.author || n.feedlabel,
                url: n.url,
                isPatchNote: isPatchNoteItem(n.title, cleaned),
                feedLabel: n.feedlabel || 'Developer Announcement',
              }
            })
          }
        } catch {
          // Network failure or CORS fallback handled below
        }

        // If specific announcement feed had no items, fallback to general news
        if (items.length === 0) {
          try {
            const fallbackUrl = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${steamAppId}&count=8&maxlength=1000`
            const res = await fetch(fallbackUrl)
            if (res.ok) {
              const data = await res.json()
              const newsitems = data?.appnews?.newsitems || []
              items = newsitems.map((n: any) => {
                const cleaned = cleanChangelogText(n.contents)
                const version = extractVersion(`${n.title} ${cleaned}`)
                return {
                  id: n.gid || String(n.date),
                  title: n.title,
                  version,
                  date: n.date,
                  content: cleaned,
                  author: n.author || n.feedlabel,
                  url: n.url,
                  isPatchNote: isPatchNoteItem(n.title, cleaned),
                  feedLabel: n.feedlabel || 'Game News',
                }
              })
            }
          } catch {}
        }
      }

      // If no online items available, only surface real detected local patch files if any
      if (items.length === 0 && localFiles.length > 0) {
        for (const f of localFiles) {
          const v = extractVersion(f.name) || 'Update'
          items.push({
            id: f.path,
            title: f.name,
            version: v,
            date: Math.floor(Date.now() / 1000),
            content: `Local update installer detected at: ${f.path}.\nReady to apply via Otix Installer.`,
            author: 'Local File',
            isPatchNote: true,
            feedLabel: 'Pending Local Patch',
          })
        }
      }

      // Determine installed and latest versions
      const latestVersion = items.find((i) => i.version)?.version || localVersions[0] || 'v1.0.0'
      const installedVersion = localFiles.length > 0 ? (localVersions[localVersions.length - 1] || 'v1.0.0') : latestVersion

      const versionInfo: GameVersionInfo = {
        installedVersion,
        latestVersion,
        hasLocalUpdate: localFiles.length > 0,
        localUpdateFiles: localFiles,
      }

      return {
        changelogs: items,
        versionInfo,
      }
    },
    enabled: !!game,
    staleTime: 1000 * 60 * 30, // 30 minutes
  })
}
