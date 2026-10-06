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
    return { label: 'Matched', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 }
  }
  const suggestion = game.otixMatchSuggestion || game.matchSuggestion
  if (suggestion) {
    const candidates = (suggestion as any)?._candidates
    const count = Array.isArray(candidates) ? candidates.length : 1
    return {
      label: `${count} candidate${count > 1 ? 's' : ''}`,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      icon: count > 1 ? Users : Star,
      candidateCount: count,
    }
  }
  return { label: 'Unmatched', color: 'text-white/30', bg: 'bg-white/5', icon: Gamepad2 }
}
