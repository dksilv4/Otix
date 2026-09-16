import { isTitleMatch } from '@media'
import { isApplicationGame } from '@/features/launcher/utils'
import {
  classifyReleaseKind,
  compareVersions,
  parseReleaseTitle,
  type ParsedGameRelease,
} from '@/features/downloads/release-parse'
import type { LocalGame, UpdateFile } from '@/features/launcher/types'
import type { ServerGameFile } from '@/features/downloads/types'

export interface ClassifiedServerFile {
  file: ServerGameFile
  parsed: ParsedGameRelease
}

export interface GroupedServerGame {
  gameKey: string
  title: string
  primary: ClassifiedServerFile
  games: ClassifiedServerFile[]
  updates: ClassifiedServerFile[]
  dlc: ClassifiedServerFile[]
}

export function hasCatalogMatch(game: Pick<LocalGame, 'otixMediaId' | 'data'>): boolean {
  const id = game.otixMediaId || game.data?.id
  return Boolean(id && id !== 'undefined' && id !== 'null')
}

export function serverGameId(gameKey: string): string {
  const slug = gameKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `server-${slug || 'untitled'}`
}

const GENERIC_INSTALLER_STEMS = new Set([
  'setup', 'install', 'installer', 'autorun', 'start', 'play', 'unins000', 'uninstall',
])
const GENERIC_FOLDERS = new Set([
  ...GENERIC_INSTALLER_STEMS,
  'bin', 'crack', 'cracks', 'redist', 'commonredist', 'directx', 'vcredist',
  'windows', 'win', 'files', 'data', 'game', 'games', 'disk1', 'disc1', 'cd1',
  'dvd', 'iso', 'unpacked', 'extracted', 'temp', 'tmp', 'update', 'updates',
  'patch', 'dlc', 'support', 'docs', 'documentation', 'payloads',
])

export function isGenericInstallerName(filename: string | undefined): boolean {
  const stem = (filename || '').replace(/\.[^.]+$/, '').toLowerCase()
  return GENERIC_INSTALLER_STEMS.has(stem)
}

/** Parent folder names nearest-first, from a library-relative short path. */
export function folderTitlesFromRelativePath(relativePath: string | undefined): string[] {
  if (!relativePath) return []
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length && /\.(iso|img|bin|cue|exe|msi|zip|7z|rar|chd|rvz)$/i.test(parts[parts.length - 1] || '')) {
    parts.pop()
  }
  const titles: string[] = []
  const seen = new Set<string>()
  for (const part of [...parts].reverse()) {
    if (part.length <= 1 || GENERIC_FOLDERS.has(part.toLowerCase())) continue
    const cleaned = part
      .replace(/[._]+/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b(?:repack|fitgirl|dodi|gog|elamigos|codex|skidrow|flt|rune|setup)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || GENERIC_FOLDERS.has(key) || seen.has(key)) continue
    seen.add(key)
    titles.push(cleaned)
  }
  return titles
}

export function installerMatchSource(file: ServerGameFile): string {
  const folders = folderTitlesFromRelativePath(file.relativePath)
  if (isGenericInstallerName(file.filename)) {
    if (folders[0]) return folders[0]
    if (file.gameTitle && !isGenericInstallerName(file.gameTitle)) return file.gameTitle
  }
  return file.filename || file.gameTitle
}

export function parseServerFile(file: ServerGameFile): ClassifiedServerFile {
  const folders = folderTitlesFromRelativePath(file.relativePath)
  const hint = file.catalogItem?.title || folders[0] || undefined
  const source = installerMatchSource(file)
  const parsed = parseReleaseTitle(source, hint)
  const kind = classifyReleaseKind(`${file.filename || ''} ${file.gameTitle || ''} ${source}`)
  if (kind === parsed.kind || kind === 'game') return { file, parsed }
  return {
    file,
    parsed: {
      ...parsed,
      kind,
      version: parsed.version || parseReleaseTitle(source).version,
    },
  }
}

function rankPrimary(item: ClassifiedServerFile): number {
  const isoBonus = item.file.formatCategory === 'iso' ? 1_000_000_000_000 : 0
  const gameBonus = item.parsed.kind === 'game' ? 1_000_000_000 : 0
  return isoBonus + gameBonus + (item.file.filesize || 0)
}

function sortUpdates(items: ClassifiedServerFile[]): ClassifiedServerFile[] {
  return [...items].sort((a, b) => compareVersions(a.parsed.version, b.parsed.version))
}

export function isBinFile(file: Pick<ServerGameFile, 'extension' | 'filename'>): boolean {
  const ext = (file.extension || '').toLowerCase()
  const name = (file.filename || '').toLowerCase()
  return ext === '.bin' || ext === 'bin' || name.endsWith('.bin')
}

export function groupServerFilesByGame(files: ServerGameFile[] | undefined): GroupedServerGame[] {
  const groups = new Map<string, ClassifiedServerFile[]>()

  for (const file of files || []) {
    if (isBinFile(file)) continue
    const classified = parseServerFile(file)
    const key = classified.parsed.gameKey || classified.parsed.gameTitle.toLowerCase()
    const list = groups.get(key) || []
    list.push(classified)
    groups.set(key, list)
  }

  const grouped = [...groups.entries()].map(([gameKey, items]) => {
    const games = items.filter((item) => item.parsed.kind === 'game')
    const updates = sortUpdates(items.filter((item) => item.parsed.kind === 'update'))
    const dlc = items.filter((item) => item.parsed.kind === 'dlc')
    const pool = games.length > 0 ? games : items
    const primary = [...pool].sort((a, b) => rankPrimary(b) - rankPrimary(a))[0]
    const catalogTitle = items.find((item) => item.file.catalogItem?.title)?.file.catalogItem?.title
    return {
      gameKey,
      title: catalogTitle || primary.parsed.gameTitle || primary.file.gameTitle,
      primary,
      games,
      updates,
      dlc,
    }
  })

  return mergeGroupsByCatalog(mergeAddonGroups(grouped))
}

function catalogIdOf(group: GroupedServerGame): string | undefined {
  return group.primary.file.catalogItem?.id
    || group.games.find((item) => item.file.catalogItem?.id)?.file.catalogItem?.id
    || group.updates.find((item) => item.file.catalogItem?.id)?.file.catalogItem?.id
    || group.dlc.find((item) => item.file.catalogItem?.id)?.file.catalogItem?.id
}

function mergeGroupsByCatalog(groups: GroupedServerGame[]): GroupedServerGame[] {
  const byId = new Map<string, GroupedServerGame>()
  const rest: GroupedServerGame[] = []
  for (const group of groups) {
    const id = catalogIdOf(group)
    if (!id) {
      rest.push(group)
      continue
    }
    const existing = byId.get(id)
    if (!existing) {
      byId.set(id, group)
      continue
    }
    existing.games.push(...group.games)
    existing.updates = sortUpdates([...existing.updates, ...group.updates])
    existing.dlc.push(...group.dlc)
    if (existing.games.length > 1) {
      const ranked = [...existing.games].sort((a, b) => rankPrimary(b) - rankPrimary(a))
      existing.primary = ranked[0]
      existing.games = [ranked[0]]
      existing.updates = sortUpdates([...existing.updates, ...ranked.slice(1)])
    } else if (group.games.length > 0 && rankPrimary(group.primary) > rankPrimary(existing.primary)) {
      existing.primary = group.primary
    }
  }
  return [...byId.values(), ...rest]
}

/** Fold update/DLC-only groups onto the longest matching base-game group. */
function mergeAddonGroups(groups: GroupedServerGame[]): GroupedServerGame[] {
  const bases = groups.filter((group) => group.games.length > 0)
  if (bases.length === 0) return groups

  const used = new Set<string>()
  for (const addon of groups) {
    if (addon.games.length > 0) continue
    const parent = [...bases]
      .filter((base) => {
        const addonId = catalogIdOf(addon)
        const baseId = catalogIdOf(base)
        if (addonId && baseId && addonId === baseId) return true
        return addon.gameKey === base.gameKey || addon.gameKey.startsWith(`${base.gameKey} `)
      })
      .sort((a, b) => b.gameKey.length - a.gameKey.length)[0]
    if (!parent) continue
    parent.updates = sortUpdates([...parent.updates, ...addon.updates])
    parent.dlc = [...parent.dlc, ...addon.dlc]
    used.add(addon.gameKey)
  }

  return groups.filter((group) => group.games.length > 0 || !used.has(group.gameKey))
}

export function isSameLauncherGame(local: LocalGame, file: ServerGameFile): boolean {
  const catalogId = file.catalogItem?.id
  if (catalogId && (local.otixMediaId === catalogId || local.data?.id === catalogId)) return true
  if (local.title && isTitleMatch(local.title, file.gameTitle)) return true
  if (file.catalogItem?.title && isTitleMatch(local.title, file.catalogItem.title)) return true
  const localKey = parseReleaseTitle(local.title).gameKey
  const fileKey = parseServerFile(file).parsed.gameKey
  return Boolean(localKey && fileKey && localKey === fileKey)
}

export function matchesGroup(local: LocalGame, group: GroupedServerGame): boolean {
  const catalogId = group.primary.file.catalogItem?.id
    || group.games.find((item) => item.file.catalogItem?.id)?.file.catalogItem?.id
  if (catalogId && (local.otixMediaId === catalogId || local.data?.id === catalogId)) return true
  if (local.id === serverGameId(group.gameKey)) return true
  const localKey = parseReleaseTitle(local.title).gameKey
  if (localKey && localKey === group.gameKey) return true
  // Named DLC/update leftovers (e.g. "cyberpunk 2077 phantom liberty") attach to the parent title.
  return Boolean(group.games.length === 0 && localKey && group.gameKey.startsWith(`${localKey} `))
}

export function findGroupedServerGame(
  files: ServerGameFile[] | undefined,
  opts: { gameId?: string | null; local?: LocalGame | null } = {},
): GroupedServerGame | null {
  const groups = groupServerFilesByGame(files)
  const { gameId, local } = opts
  if (gameId) {
    const byId = groups.find((group) => serverGameId(group.gameKey) === gameId)
    if (byId) return byId
  }
  if (local) {
    const byLocal = groups.find((group) => matchesGroup(local, group))
    if (byLocal) return byLocal
  }
  if (gameId) {
    return groups.find((group) => {
      const ids = [
        group.primary.file.catalogItem?.id,
        ...group.games.map((item) => item.file.catalogItem?.id),
      ]
      return ids.includes(gameId)
    }) || null
  }
  return null
}

export function groupedUpdateFiles(group: GroupedServerGame): UpdateFile[] {
  return [...group.updates, ...group.dlc].map((item) => ({
    name: item.file.filename,
    path: item.file.downloadUrl || item.file.filename,
    kind: item.parsed.kind === 'dlc' ? 'dlc' : 'update',
    version: item.parsed.version,
    filesize: item.file.filesize,
  }))
}

function mergeUpdateFiles(existing: UpdateFile[] | undefined, incoming: UpdateFile[]): UpdateFile[] {
  const byPath = new Map<string, UpdateFile>()
  for (const file of existing || []) byPath.set(file.path, file)
  for (const file of incoming) byPath.set(file.path, file)
  return [...byPath.values()]
}

function catalogFromGroup(group: GroupedServerGame) {
  return group.primary.file.catalogItem
    || group.games.find((item) => item.file.catalogItem)?.file.catalogItem
    || group.updates.find((item) => item.file.catalogItem)?.file.catalogItem
    || group.dlc.find((item) => item.file.catalogItem)?.file.catalogItem
    || null
}

function applyCatalogToLocal(game: LocalGame, group: GroupedServerGame): void {
  const catalog = catalogFromGroup(group)
  if (!catalog) return
  if (!game.otixMediaId) game.otixMediaId = catalog.id
  if (!game.otixMediaTitle) game.otixMediaTitle = catalog.title
  if (!game.otixMediaSlug) game.otixMediaSlug = catalog.slug
  if (!game.otixPosterUrl && catalog.posterUrl) game.otixPosterUrl = catalog.posterUrl
  if (!game.otixBackdropUrl && catalog.backdropUrl) game.otixBackdropUrl = catalog.backdropUrl
  if (!game.otixLogoUrl && catalog.logoUrl) game.otixLogoUrl = catalog.logoUrl
  if (!game.otixTextlessPosterUrl && catalog.textlessPosterUrl) game.otixTextlessPosterUrl = catalog.textlessPosterUrl
  if (!game.otixIconUrl && catalog.iconUrl) game.otixIconUrl = catalog.iconUrl
  if (!game.posterUrl && catalog.posterUrl) game.posterUrl = catalog.posterUrl
  if (!game.data?.id) {
    game.data = {
      id: catalog.id,
      title: catalog.title,
      slug: catalog.slug,
      overview: catalog.overview ?? null,
      posterUrl: catalog.posterUrl ?? undefined,
      backdropUrl: catalog.backdropUrl ?? undefined,
      logoUrl: catalog.logoUrl ?? undefined,
      textlessPosterUrl: catalog.textlessPosterUrl ?? undefined,
      iconUrl: catalog.iconUrl ?? undefined,
    }
  }
}

export function attachGroupToLocalGame(game: LocalGame, group: GroupedServerGame | null): LocalGame {
  if (!group) return game
  const next = { ...game }
  next.updateFiles = mergeUpdateFiles(next.updateFiles, groupedUpdateFiles(group))
  applyCatalogToLocal(next, group)
  return next
}

export function serverFileToLocalGame(file: ServerGameFile): LocalGame {
  return groupedServerGameToLocalGame({
    gameKey: parseServerFile(file).parsed.gameKey,
    title: file.catalogItem?.title || file.gameTitle,
    primary: parseServerFile(file),
    games: [parseServerFile(file)],
    updates: [],
    dlc: [],
  })
}

export function groupedServerGameToLocalGame(group: GroupedServerGame): LocalGame {
  const catalog = catalogFromGroup(group)
  const title = catalog?.title || group.title
  const updates = groupedUpdateFiles(group)
  const extraCount = updates.length
  const filename = group.primary.file.relativePath || group.primary.file.filename
  const location = filename
    ? `On ${group.primary.file.serverName} · ${filename}`
    : `On ${group.primary.file.serverName}`
  return {
    id: serverGameId(group.gameKey),
    title,
    platform: 'server',
    exePath: '',
    installDir: '',
    description: extraCount
      ? `${location} · ${extraCount} extra file${extraCount === 1 ? '' : 's'}`
      : location,
    posterUrl: catalog?.posterUrl ?? undefined,
    otixMediaId: catalog?.id,
    otixMediaTitle: catalog?.title || title,
    otixMediaSlug: catalog?.slug,
    otixPosterUrl: catalog?.posterUrl ?? undefined,
    otixBackdropUrl: catalog?.backdropUrl ?? undefined,
    otixLogoUrl: catalog?.logoUrl ?? undefined,
    otixTextlessPosterUrl: catalog?.textlessPosterUrl ?? undefined,
    otixIconUrl: catalog?.iconUrl ?? undefined,
    updateFiles: updates,
    sources: ['server'],
    data: catalog
      ? {
          id: catalog.id,
          title: catalog.title,
          slug: catalog.slug,
          overview: catalog.overview ?? null,
          posterUrl: catalog.posterUrl ?? undefined,
          backdropUrl: catalog.backdropUrl ?? undefined,
          logoUrl: catalog.logoUrl ?? undefined,
          textlessPosterUrl: catalog.textlessPosterUrl ?? undefined,
          iconUrl: catalog.iconUrl ?? undefined,
        }
      : undefined,
  }
}

/** Local library plus scanned server releases, de-duplicated by catalog/title match. */
export function mergeLocalAndServerGames(
  localGames: LocalGame[] | undefined,
  files: ServerGameFile[] | undefined,
): LocalGame[] {
  const all = (localGames || []).filter((game) => !isApplicationGame(game)).map((game) => ({ ...game }))
  const installed = all.filter((game) => game.platform !== 'server')
  const persistedServer = all.filter((game) => game.platform === 'server')
  const extras: LocalGame[] = []
  const claimedServer = new Set<string>()
  const groups = groupServerFilesByGame(files)

  for (const group of groups) {
    const updates = groupedUpdateFiles(group)
    const existing = installed.find((game) => matchesGroup(game, group))
      || extras.find((game) => matchesGroup(game, group))
      || persistedServer.find((game) => matchesGroup(game, group))
    if (existing) {
      existing.updateFiles = mergeUpdateFiles(existing.updateFiles, updates)
      applyCatalogToLocal(existing, group)
      if (existing.platform === 'server' && group.games.length > 0) claimedServer.add(existing.id)
      continue
    }
    // Unmatched scene dumps stay off the library — only catalog games become cards.
    if (group.games.length === 0) continue
    const next = groupedServerGameToLocalGame(group)
    if (!hasCatalogMatch(next)) continue
    extras.push(next)
  }

  const keptServer = persistedServer.filter((game) => {
    if (!hasCatalogMatch(game)) return false
    if (claimedServer.has(game.id)) return true
    return files == null
  })
  return [...installed, ...keptServer, ...extras]
}

export function serverGamesToPersist(games: LocalGame[]): LocalGame[] {
  return games.filter((game) => game.platform === 'server' && hasCatalogMatch(game))
}

export type FoundServerGameStatus = 'in-library' | 'unmatched'

export interface FoundServerGame {
  game: LocalGame
  status: FoundServerGameStatus
  filename: string
  filesize: number
  serverName: string
  extraCount: number
}

function existingForGroup(locals: LocalGame[], group: GroupedServerGame): LocalGame | undefined {
  return locals.find((game) => matchesGroup(game, group))
}

function foundStatus(
  game: LocalGame,
  existing: LocalGame | undefined,
  visibleIds: Set<string>,
): FoundServerGameStatus {
  if (hasCatalogMatch(game) || hasCatalogMatch(existing || {})) return 'in-library'
  if (existing && existing.platform !== 'server') return 'in-library'
  if (visibleIds.has(game.id) || (existing && visibleIds.has(existing.id))) return 'in-library'
  return 'unmatched'
}

/** Every scanned base game (not updates/DLC), including titles that did not auto-match. */
export function listFoundServerGames(
  localGames: LocalGame[] | undefined,
  files: ServerGameFile[] | undefined,
): FoundServerGame[] {
  if (files == null) return []
  const locals = (localGames || []).filter((game) => !isApplicationGame(game))
  const visibleIds = new Set(mergeLocalAndServerGames(localGames, files).map((game) => game.id))
  const found: FoundServerGame[] = []

  for (const group of groupServerFilesByGame(files)) {
    if (group.games.length === 0) continue
    if (isBinFile(group.primary.file)) continue
    const game = groupedServerGameToLocalGame(group)
    const existing = existingForGroup(locals, group)
    if (existing && hasCatalogMatch(existing)) {
      applyCatalogToLocal(game, group)
      if (!game.otixMediaId) game.otixMediaId = existing.otixMediaId
      if (!game.data?.id) game.data = existing.data
    }
    found.push({
      game,
      status: foundStatus(game, existing, visibleIds),
      filename: group.primary.file.relativePath || group.primary.file.filename,
      filesize: group.primary.file.filesize,
      serverName: group.primary.file.serverName,
      extraCount: group.updates.length + group.dlc.length + Math.max(0, group.games.length - 1),
    })
  }

  return found.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1
    return a.game.title.localeCompare(b.game.title)
  })
}

export function listUnmatchedServerGames(
  localGames: LocalGame[] | undefined,
  files: ServerGameFile[] | undefined,
): LocalGame[] {
  return listFoundServerGames(localGames, files)
    .filter((item) => item.status === 'unmatched')
    .map((item) => item.game)
}

const AUTO_MATCH_LIMIT = 25

/** Prefer clean, short unmatched titles so exact catalog/IGDB hits run first. */
export function autoMatchTargetGames(games: LocalGame[], limit = AUTO_MATCH_LIMIT): LocalGame[] {
  return [...games]
    .sort((a, b) => {
      const aClean = Number(!/[._]/.test(a.title))
      const bClean = Number(!/[._]/.test(b.title))
      if (aClean !== bClean) return bClean - aClean
      const aWords = a.title.trim().split(/\s+/).length
      const bWords = b.title.trim().split(/\s+/).length
      if (aWords !== bWords) return aWords - bWords
      return a.title.length - b.title.length || a.title.localeCompare(b.title)
    })
    .slice(0, limit)
}

export function applyAutoMatchToGame(
  game: LocalGame,
  match: {
    mediaItemId: string
    title: string
    posterUrl?: string | null
    backdropUrl?: string | null
  },
): LocalGame {
  const title = match.title || game.title
  return {
    ...game,
    title,
    posterUrl: match.posterUrl ?? game.posterUrl,
    otixMediaId: match.mediaItemId,
    otixMediaTitle: title,
    otixPosterUrl: match.posterUrl ?? game.otixPosterUrl,
    otixBackdropUrl: match.backdropUrl ?? game.otixBackdropUrl,
    data: {
      ...game.data,
      id: match.mediaItemId,
      title,
      slug: game.data?.slug || game.otixMediaSlug || '',
      posterUrl: match.posterUrl ?? game.data?.posterUrl,
      backdropUrl: match.backdropUrl ?? game.data?.backdropUrl,
    },
    matchSuggestion: undefined,
  }
}

/** Unique titles from the Found on servers list, for catalog prehydrate. */
export function foundServerGameTitles(
  localGames: LocalGame[] | undefined,
  files: ServerGameFile[] | undefined,
): string[] {
  const titles: string[] = []
  const seen = new Set<string>()
  for (const item of listFoundServerGames(localGames, files)) {
    const title = (item.game.title || '').trim()
    const key = title.toLowerCase()
    if (!title || seen.has(key)) continue
    seen.add(key)
    titles.push(title)
  }
  return titles
}

/** Matched library extras plus unmatched scans so a later manual match can persist. */
export function persistableServerGames(
  localGames: LocalGame[] | undefined,
  files: ServerGameFile[] | undefined,
): LocalGame[] | null {
  if (files == null) return null
  const byId = new Map<string, LocalGame>()
  for (const game of serverGamesToPersist(mergeLocalAndServerGames(localGames, files))) {
    byId.set(game.id, game)
  }
  for (const game of listUnmatchedServerGames(localGames, files)) {
    if (!byId.has(game.id)) byId.set(game.id, game)
  }
  return [...byId.values()]
}
