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

export const extractIntegrationMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export const openBoundModal = (
  openModal: (component: ReactNode) => () => void,
  render: (onClose: () => void) => ReactNode,
): void => {
  const closeRef = { current: () => {} }
  closeRef.current = openModal(render(() => closeRef.current()))
}

export const formatDaysAgo = (unixTimestamp: number): string => {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp)
  if (isNaN(seconds) || seconds < 0) return 'today'
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  const days = Math.floor(seconds / 86400)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
