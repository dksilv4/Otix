export interface User {
  id: string
  email: string
  username: string
  isVerified: boolean
  avatarUrl?: string | null
  bio?: string | null
  backgroundUrl?: string | null
}

export interface TokenResponse {
  accessToken: string
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identity: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
