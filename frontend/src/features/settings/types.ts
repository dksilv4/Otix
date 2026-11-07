export type { PlexIntegration } from './types/settings'
export type { GameServer } from '@/features/downloads/types'
export * from './types/index'

export interface SettingsUser {
  email: string
  username: string
  isAdmin?: boolean
  isVerified?: boolean
  twoFactorEnabled?: boolean
  dailyMoodCheckinsEnabled?: boolean
  bio?: string | null
  avatarUrl?: string | null
  backgroundUrl?: string | null
  steamId?: string | null
  epicAccountId?: string | null
  epicDisplayName?: string | null
  gogAccountId?: string | null
  gogDisplayName?: string | null
  plexId?: string | null
  tmdbUsername?: string | null
  country?: string | null
  googleId?: string | null
  googleName?: string | null
  googleEmail?: string | null
  googleAvatarUrl?: string | null
  driveConnected?: boolean
  plexWatchHistoryEnabled?: boolean
  tmdbAvatarUrl?: string | null
  tmdbRatingSyncDirection?: string | null
}
