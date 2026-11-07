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

export { openBoundModal } from '@/lib/modals'

export { formatDaysAgo } from '@/lib/utils/format-days-ago'

export const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  epic: '#ffffff',
  gog: '#a855f7',
  plex: '#e5a00d',
  tmdb: '#01b4e4',
  google: '#4285F4',
  youtube: '#FF0000',
}

export const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  epic: 'bg-foreground/10',
  gog: 'bg-[#a855f7]/10',
  plex: 'bg-[#e5a00d]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
  youtube: 'bg-[#FF0000]/10',
}

