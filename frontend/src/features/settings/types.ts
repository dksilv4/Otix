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
  plexId?: string | null
  tmdbUsername?: string | null
  country?: string | null
}
