import type { GameMatchRecord } from '../types/node-paths'

export type MatchFilterTab = 'needs_review' | 'unmatched' | 'matched' | 'all'

export { formatFileSize } from '@/lib/utils/format-bytes'

export const getConfidenceBadge = (confidence: number) => {
  const pct = Math.round(confidence * 100)
  if (pct >= 85) {
    return { label: `${pct}% Match`, variant: 'success' as const }
  }
  if (pct >= 50) {
    return { label: `${pct}% Possible`, variant: 'warning' as const }
  }
  return { label: `${pct}% Low`, variant: 'muted' as const }
}

export const filterMatchRecords = (
  records: GameMatchRecord[],
  tab: MatchFilterTab,
  query: string,
): GameMatchRecord[] => {
  const q = query.trim().toLowerCase()
  return records.filter((r) => {
    if (tab === 'needs_review' && r.matchStatus !== 'needs_review') return false
    if (tab === 'unmatched' && r.matchStatus !== 'unmatched') return false
    if (tab === 'matched' && r.matchStatus !== 'matched') return false

    if (q) {
      const matchTitle = (r.cleanedTitle || '').toLowerCase().includes(q)
      const matchRaw = (r.rawTitle || '').toLowerCase().includes(q)
      const matchRel = (r.relativePath || '').toLowerCase().includes(q)
      const matchCandidate = (r.candidates || []).some((c) => (c.title || '').toLowerCase().includes(q))
      return matchTitle || matchRaw || matchRel || matchCandidate
    }
    return true
  })
}

export const synthesizeMatchRecordsFromLocalGames = (
  games: any[],
  status?: string,
  q?: string,
  nodeId?: number | null,
): GameMatchRecord[] => {
  const records: GameMatchRecord[] = []
  let idCounter = 1
  for (const g of games) {
    const titleStr = (g.title || '').toLowerCase()
    const pathStr = (g.exePath || g.installDir || '').toLowerCase()

    // Guard against full games stating they bundle DLC or updates
    const isBundledDlc =
      /(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?dlc/i.test(titleStr) ||
      /dlc[._\-\s]+(?:included|bundle|complete|edition)/i.test(titleStr) ||
      /\[.*(?:incl|with|all|\+).*dlc.*\]/i.test(titleStr) ||
      /\(.*(?:incl|with|all|\+).*dlc.*\)/i.test(titleStr)

    const isBundledUpdate =
      /(?:incl|including|includes|with|all|\+)[._\-\s]+(?:all[._\-\s]+)?(?:upd|update|patch)/i.test(titleStr) ||
      /update[._\-\s]+(?:included|bundle|complete|pack)/i.test(titleStr) ||
      /\[.*(?:incl|with|all|\+).*(?:upd|patch).*\]/i.test(titleStr) ||
      /\(.*(?:incl|with|all|\+).*(?:upd|patch).*\)/i.test(titleStr)

    const isUpdate =
      !isBundledUpdate &&
      (g.formatCategory === 'update' ||
        (g as any).isUpdate ||
        /(?:\[|\()0100[0-9a-fA-F]{8,10}800(?:\)|\])/i.test(titleStr) ||
        /\[(?:upd|update|patch|hotfix)[^\]]*\]/i.test(titleStr) ||
        /\((?:upd|update|patch|hotfix)[^)]*\)/i.test(titleStr) ||
        /-a\d{4}-v\d{4}/i.test(pathStr) ||
        /-a\d{4}/i.test(pathStr) ||
        /\[v(?:65536|131072|196608|262144|\d{5,})\]/i.test(titleStr))

    const isDlc =
      !isBundledDlc &&
      (g.isDlc ||
        g.formatCategory === 'dlc' ||
        /(?:\[|\()0100[0-9a-fA-F]{8,10}(?!000|800)[0-9a-fA-F]{3}(?:\)|\])/i.test(titleStr) ||
        /\[(?:dlc|addon|expansion)[^\]]*\]/i.test(titleStr) ||
        /\((?:dlc|addon|expansion)[^)]*\)/i.test(titleStr))

    if (!g || g.isApp || isDlc || isUpdate) continue
    const isMatched = Boolean(g.otixMediaId || g.data?.id)
    const suggestions = Array.isArray(g.suggestions)
      ? g.suggestions
      : g.matchSuggestion
        ? [g.matchSuggestion]
        : []
    const hasSuggestions = suggestions.length > 0
    const matchStatus: GameMatchRecord['matchStatus'] = isMatched
      ? 'matched'
      : hasSuggestions
        ? 'needs_review'
        : 'unmatched'

    if (status && status !== 'all' && matchStatus !== status) continue
    if (q) {
      const qLower = q.toLowerCase()
      const titleMatches = (g.title || '').toLowerCase().includes(qLower)
      const candMatches = suggestions.some((s: any) =>
        (s?.title || s?.otixTitle || '').toLowerCase().includes(qLower),
      )
      if (!titleMatches && !candMatches) continue
    }

    const candidates = suggestions.map((s: any) => ({
      mediaId: String(s.id || s.mediaItemId || ''),
      title: s.title || s.otixTitle || '',
      slug: s.slug || '',
      posterUrl: s.posterUrl || s.poster_url || s.images?.poster?.url || null,
      backdropUrl: s.backdropUrl || s.backdrop_url || s.images?.backdrop?.url || null,
      releaseYear: s.releaseDate
        ? parseInt(String(s.releaseDate).slice(0, 4))
        : s.releaseYear || null,
      confidence: s.confidence ?? 0.8,
    }))

    records.push({
      id: idCounter++,
      canonicalKey: g.id,
      rawTitle: g.title,
      cleanedTitle: g.title,
      relativePath: g.exePath || g.installDir || '',
      formatCategory: g.platform === 'iso' ? 'iso' : g.platform === 'rom' ? 'rom' : 'pc',
      filesize: g.filesize || 0,
      sha256Head: '',
      matchStatus,
      confidence: g.otixConfidence ?? (isMatched ? 1.0 : 0),
      candidates,
      userOverride: false,
      mediaItemId: g.otixMediaId || (g.data?.id ? String(g.data.id) : null),
      media: isMatched
        ? {
            id: g.otixMediaId || String(g.data?.id || ''),
            title: g.otixMediaTitle || g.data?.title || g.title,
            slug: g.otixMediaSlug || g.data?.slug || '',
            posterUrl:
              g.posterUrl ||
              g.otixPosterUrl ||
              g.data?.posterUrl ||
              g.data?.poster_url ||
              g.data?.images?.poster?.url ||
              g.iconUrl ||
              g.otixIconUrl ||
              null,
            backdropUrl:
              g.backdropUrl ||
              g.otixBackdropUrl ||
              g.data?.backdropUrl ||
              g.data?.backdrop_url ||
              g.data?.images?.backdrop?.url ||
              null,
            releaseDate: g.data?.releaseDate || g.data?.release_date || null,
          }
        : null,
      storageShareId: null,
      storageShareName: 'Local Storage',
      nodeId: nodeId ?? -1,
      nodeName: 'This PC',
      lastSeenAt: g.lastPlayedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return records
}
