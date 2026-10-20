export interface User {
  id: string
  email: string
  username: string
  isAdmin?: boolean
  totalXp?: number
  isVerified: boolean
  twoFactorEnabled: boolean
  steamId?: string | null
  epicAccountId?: string | null
  epicDisplayName?: string | null
  gogAccountId?: string | null
  gogDisplayName?: string | null
  plexId?: string | null
  tmdbAccountId?: number | null
  tmdbUsername?: string | null
  tmdbAvatarUrl?: string | null
  tmdbRatingSyncDirection?: string | null
  googleId?: string | null
  googleName?: string | null
  googleEmail?: string | null
  googleAvatarUrl?: string | null
  driveConnected?: boolean
  avatarUrl?: string | null
  bio?: string | null
  backgroundUrl?: string | null
  integrationVisibility?: Record<string, string> | null
  dailyMoodCheckinsEnabled?: boolean
  plexWatchHistoryEnabled?: boolean
  hall_of_fame_media_ids?: Record<string, string[]>
  profileCardSections?: string[] | null
  onboardingCompleted?: boolean
  tasteResetAt?: string | null
  preferredMediaTypes?: string[]
  preferredGenres?: string[]
  preferredLanguages?: string[]
  discoverEmphases?: string[]
  dateOfBirth?: string | null
  showAdultContent?: boolean
  saveGameSessions?: boolean
  gameSessionsPrivate?: boolean
  country?: string | null
  notificationPreferences?: Record<string, boolean> | null
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
  login: (identity: string, password: string) => Promise<LoginResponse>
  verifyTwoFactor: (code: string) => Promise<void>
  cancelTwoFactor: () => void
  register: (email: string, username: string, password: string, dateOfBirth: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export type AuthFormMode = 'login' | 'register'

export type ForgotPasswordPageState = 'idle' | 'sending' | 'sent' | 'error'
export type ResetPasswordPageState = 'idle' | 'submitting' | 'success' | 'error'
export type VerifyEmailPageState = 'verifying' | 'success' | 'error' | 'sending'

export type CallbackService = 'google' | 'google-login' | 'plex' | 'plex-login' | 'tmdb' | 'tmdb-login' | 'steam' | 'steam-connect'

export interface StandardServiceConfig {
  endpoint: string
  loadingColor?: string
  validateParams?: (params: URLSearchParams) => string | null
  buildBody: (params: URLSearchParams) => Record<string, unknown> | null
}
