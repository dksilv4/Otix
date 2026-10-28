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
