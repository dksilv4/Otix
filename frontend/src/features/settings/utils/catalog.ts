import { Gamepad2, CheckCircle2, Star, Users } from 'lucide-react'
import type { LocalGame } from '@/features/launcher/types'

export interface GameStatusInfo {
  label: string
  color: string
  bg: string
  icon: typeof CheckCircle2
  candidateCount?: number
}

export const getStatusInfo = (game: LocalGame): GameStatusInfo => {
  if (game.data?.id || game.otixMediaId) {
    return { label: 'Matched', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 }
  }
  const suggestion = game.otixMatchSuggestion || game.matchSuggestion
  if (suggestion) {
    const candidates = (suggestion as any)?._candidates
    const count = Array.isArray(candidates) ? candidates.length : 1
    return {
      label: `${count} candidate${count > 1 ? 's' : ''}`,
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-500/10',
      icon: count > 1 ? Users : Star,
      candidateCount: count,
    }
  }
  return { label: 'Unmatched', color: 'text-muted-foreground', bg: 'bg-[var(--dk-surface-field)]', icon: Gamepad2 }
}
