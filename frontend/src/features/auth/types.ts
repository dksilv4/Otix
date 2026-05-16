export interface User {
  id: string
  email: string
  username: string
  isAdmin?: boolean
  isVerified: boolean
  twoFactorEnabled: boolean
  steamId?: string | null
  plexId?: string | null
  tmdbAccountId?: number | null
  tmdbUsername?: string | null
  tmdbAvatarUrl?: string | null
  tmdbRatingSyncDirection?: string | null
  spotifyId?: string | null
  spotifyUsername?: string | null
  spotifyAvatarUrl?: string | null
  avatarUrl?: string | null
  bio?: string | null
  backgroundUrl?: string | null
  integrationVisibility?: Record<string, string> | null
  dailyMoodCheckinsEnabled?: boolean
}

export interface TokenResponse {
  accessToken: string
}

export interface TwoFactorChallenge {
  challengeToken: string
}

export interface LoginResponse {
  accessToken: string | null
  twoFactorRequired: boolean
  challengeToken: string | null
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  twoFactorChallenge: TwoFactorChallenge | null
  login: (identity: string, password: string) => Promise<void>
  verifyTwoFactor: (code: string) => Promise<void>
  cancelTwoFactor: () => void
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}
