import type { ScannedGameItem, CatalogCandidate } from './scanned-summary'
import { searchCatalogGames, matchScannedGameItem } from './scanned-summary'
import {
  cleanTitleForSearch,
  normalizePlatformValue,
  resolvePlatformLabel,
} from './node-scan-files'

export type MassMatchStatus = 'high_confidence' | 'needs_review' | 'unmatched'
export type MassMatchFilterTab = 'all' | 'ready' | 'review' | 'unmatched'

export interface MassMatchRowItem {
  id: string
  game: ScannedGameItem
  cleanTitle: string
  status: MassMatchStatus
  confidence: number
  selectedCandidate: CatalogCandidate | null
  otherCandidates: CatalogCandidate[]
  selectedPlatform: string
  isSelected: boolean
}

export interface BatchApplyProgress {
  processed: number
  total: number
  succeeded: number
  failed: number
  lastTitle?: string
}

export interface BatchApplyResult {
  succeeded: ScannedGameItem[]
  failed: Array<{ item: MassMatchRowItem; error: string }>
}

/**
 * Extracts trailing numeric/roman sequel indicator if present.
 */
function extractSequelIdentifier(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  const last = tokens[tokens.length - 1]
  if (/^(?:[0-9]+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(last)) {
    return last.toLowerCase()
  }
  return null
}

/**
 * Normalizes a game title for token and containment comparison.
 */
export function normalizeTitleForComparison(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(game of the year|goty|edition|remastered|remake|deluxe|definitive|directors cut|director s cut)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Computes heuristic match confidence between scanned and catalog titles (0.0 to 1.0).
 */
export function computeMatchConfidence(scannedTitle: string, candidateTitle: string): number {
  if (!scannedTitle || !candidateTitle) return 0

  const sNorm = normalizeTitleForComparison(scannedTitle)
  const cNorm = normalizeTitleForComparison(candidateTitle)

  if (!sNorm || !cNorm) return 0
  if (sNorm === cNorm) return 0.95

  const sTokens = sNorm.split(' ').filter(Boolean)
  const cTokens = cNorm.split(' ').filter(Boolean)

  if (sTokens.length === 0 || cTokens.length === 0) return 0

  // Check sequel indicator mismatch (e.g. "II" vs "III", "2" vs "3")
  const sSeq = extractSequelIdentifier(sTokens)
  const cSeq = extractSequelIdentifier(cTokens)
  const sequelMismatch = Boolean(sSeq && cSeq && sSeq !== cSeq)

  const sWords = new Set(sTokens)
  const cWords = new Set(cTokens)

  let intersectionCount = 0
  for (const word of sWords) {
    if (cWords.has(word)) {
      intersectionCount++
    }
  }

  const unionCount = new Set([...sWords, ...cWords]).size
  const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0

  // Direct containment check (e.g. title is a full prefix or substring)
  const isContained = !sequelMismatch && (sNorm.includes(cNorm) || cNorm.includes(sNorm))
  const lengthRatio = Math.min(sNorm.length, cNorm.length) / Math.max(sNorm.length, cNorm.length)

  if (sequelMismatch) {
    return Math.min(0.60, Math.round(jaccard * 100) / 100)
  }

  if (isContained && lengthRatio >= 0.75) {
    return Math.max(0.88, Math.round(jaccard * 100) / 100)
  }

  if (jaccard >= 0.8) return 0.90
  if (jaccard >= 0.6) return 0.75
  if (jaccard >= 0.4) return 0.60
  if (isContained) return 0.65

  return Math.round(jaccard * 100) / 100
}

/**
 * Executes async tasks with a bounded concurrency pool.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  signal: AbortSignal | undefined,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let currentIndex = 0

  const poolSize = Math.max(1, Math.min(concurrency, items.length))
  const workers = Array.from({ length: poolSize }, async () => {
    while (currentIndex < items.length) {
      if (signal?.aborted) break
      const idx = currentIndex++
      try {
        results[idx] = await fn(items[idx], idx)
      } catch {
        // Individual item errors handled inside fn
      }
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Analyzes an array of scanned games concurrently, querying catalog candidates
 * and classifying each row into high_confidence, needs_review, or unmatched.
 */
export async function batchAnalyzeGamesForMatch(
  games: ScannedGameItem[],
  concurrency: number = 5,
  onProgress?: (processed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MassMatchRowItem[]> {
  const total = games.length
  let processed = 0

  const rows = await runWithConcurrencyLimit(
    games,
    concurrency,
    signal,
    async (game, index) => {
      const cleanTitle = cleanTitleForSearch(game.title) || game.title
      const initialPlat = normalizePlatformValue(game.platform || resolvePlatformLabel(game))
      const rowId = String(game.id || `game-${index}`)

      let candidates: CatalogCandidate[] = []
      try {
        candidates = await searchCatalogGames(cleanTitle)
        if (candidates.length === 0) {
          const simplified = cleanTitle
            .replace(/[:\-–—].*$/, '')
            .replace(/\b(edition|remastered|remake|goty|deluxe)\b/gi, '')
            .trim()
          if (simplified.length >= 3 && simplified.toLowerCase() !== cleanTitle.toLowerCase()) {
            candidates = await searchCatalogGames(simplified)
          }
        }
      } catch {
        candidates = []
      }

      processed++
      onProgress?.(processed, total)

      if (candidates.length === 0) {
        return {
          id: rowId,
          game,
          cleanTitle,
          status: 'unmatched' as MassMatchStatus,
          confidence: 0,
          selectedCandidate: null,
          otherCandidates: [],
          selectedPlatform: initialPlat,
          isSelected: false,
        }
      }

      const top = candidates[0]
      const confidence = computeMatchConfidence(cleanTitle, top.title)
      const isHighConfidence = confidence >= 0.85

      return {
        id: rowId,
        game,
        cleanTitle,
        status: (isHighConfidence ? 'high_confidence' : 'needs_review') as MassMatchStatus,
        confidence,
        selectedCandidate: top,
        otherCandidates: candidates.slice(1),
        selectedPlatform: initialPlat,
        isSelected: isHighConfidence,
      }
    },
  )

  return rows.filter(Boolean)
}

/**
 * Commits selected matched games in bulk using bounded concurrency.
 */
export async function batchApplyMatches(
  items: MassMatchRowItem[],
  concurrency: number = 5,
  onProgress?: (progress: BatchApplyProgress) => void,
  signal?: AbortSignal,
): Promise<BatchApplyResult> {
  const selectedItems = items.filter((i) => i.isSelected && i.selectedCandidate)
  const total = selectedItems.length
  let processed = 0
  let succeededCount = 0
  let failedCount = 0

  const succeeded: ScannedGameItem[] = []
  const failed: Array<{ item: MassMatchRowItem; error: string }> = []

  await runWithConcurrencyLimit(selectedItems, concurrency, signal, async (item) => {
    if (signal?.aborted) return

    try {
      const updated = await matchScannedGameItem(
        item.game,
        item.selectedCandidate!,
        item.selectedPlatform,
      )
      succeeded.push(updated)
      succeededCount++
    } catch (err: any) {
      failedCount++
      failed.push({
        item,
        error: err?.message || 'Failed to apply game match.',
      })
    } finally {
      processed++
      onProgress?.({
        processed,
        total,
        succeeded: succeededCount,
        failed: failedCount,
        lastTitle: item.selectedCandidate?.title || item.game.title,
      })
    }
  })

  return { succeeded, failed }
}

/**
 * Filters rows based on selected tab and search query.
 */
export function filterMassMatchRows(
  rows: MassMatchRowItem[],
  tab: MassMatchFilterTab,
  searchQuery: string,
): MassMatchRowItem[] {
  const query = searchQuery.trim().toLowerCase()

  return rows.filter((row) => {
    // Tab filter
    if (tab === 'ready' && !row.isSelected) return false
    if (tab === 'review' && row.status !== 'needs_review') return false
    if (tab === 'unmatched' && row.status !== 'unmatched') return false

    // Search query
    if (query) {
      const scannedMatch = (row.game.title || '').toLowerCase().includes(query)
      const pathMatch = (row.game.path || '').toLowerCase().includes(query)
      const candMatch = (row.selectedCandidate?.title || '').toLowerCase().includes(query)
      if (!scannedMatch && !pathMatch && !candMatch) return false
    }

    return true
  })
}

/**
 * Calculates summary statistics for mass match rows.
 */
export function getMassMatchStats(rows: MassMatchRowItem[]) {
  const total = rows.length
  const highConfidence = rows.filter((r) => r.status === 'high_confidence').length
  const needsReview = rows.filter((r) => r.status === 'needs_review').length
  const unmatched = rows.filter((r) => r.status === 'unmatched').length
  const selectedCount = rows.filter((r) => r.isSelected && r.selectedCandidate).length

  return {
    total,
    highConfidence,
    needsReview,
    unmatched,
    selectedCount,
  }
}
