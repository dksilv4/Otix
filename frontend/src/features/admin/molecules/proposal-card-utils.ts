// TODO: Review this file
import type { MediaEditProposal } from '../admin-edit-queries'

export const IMAGE_TYPE_LABELS: Record<string, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  logo: 'Logo',
  textless_poster: 'Textless Poster',
}

export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  overview: 'Overview',
  tagline: 'Tagline',
  status: 'Status',
  release_date: 'Release Date',
  original_language: 'Original Language',
  runtime: 'Runtime',
}

export function changeSummary(proposal: MediaEditProposal): string {
  const parts: string[] = []
  const changedFields = Object.keys(proposal.changes ?? {})
  if (changedFields.length > 0) {
    parts.push('Changed ' + changedFields.join(', '))
  }
  if (proposal.imageOverrides && proposal.imageOverrides.length > 0) {
    const types = proposal.imageOverrides.map(
      (o) => `${IMAGE_TYPE_LABELS[o.imageType] ?? o.imageType} (${o.languageCode})`,
    )
    parts.push('Overrode ' + types.join(', '))
  }
  return parts.join('; ') || 'No changes recorded'
}

export function statusBadge(status: string) {
  switch (status) {
    case 'approved':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Approved' }
    case 'rejected':
      return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' }
    default:
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Pending' }
  }
}
