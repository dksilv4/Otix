import type { ReactNode } from 'react'

export interface YouTubeProgressState {
  phase: string
  detail?: string
}

export const PERSONA_STATES: Record<number, string> = {
  0: 'Offline',
  1: 'Online',
  2: 'Busy',
  3: 'Away',
  4: 'Snooze',
  5: 'Looking to trade',
  6: 'Looking to play',
}

export const formatAccountAge = (unixTimestamp: number | null): string => {
  if (!unixTimestamp) return ''
  const created = new Date(unixTimestamp * 1000)
  const now = new Date()
  const years = now.getFullYear() - created.getFullYear()
  const monthDiff = now.getMonth() - created.getMonth()
  const adjustedYears = monthDiff < 0 ? years - 1 : years
  if (adjustedYears < 1) return 'Joined this year'
  if (adjustedYears === 1) return '1 year on Steam'
  return `${adjustedYears} years on Steam`
}

export const personaStateLabel = (state: number | null): string => {
  if (state === null || state === undefined) return 'Unknown'
  return PERSONA_STATES[state] ?? 'Unknown'
}

export { extractIntegrationMessage } from '@/lib/utils/format-error'

export const openBoundModal = (
  openModal: (component: ReactNode) => () => void,
  render: (onClose: () => void) => ReactNode,
): void => {
  const closeRef = { current: () => {} }
  closeRef.current = openModal(render(() => closeRef.current()))
}

export { formatDaysAgo } from '@/lib/utils/format-days-ago'
