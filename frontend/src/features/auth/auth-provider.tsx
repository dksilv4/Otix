// TODO: Review this file
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import { useDeepLink } from '@/lib/use-deep-link'
import type { User, AuthState, TwoFactorChallenge, LoginResponse } from './types'

const ACCESS_TOKEN_KEY = 'otix-access-token'

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * Merge integration fields (plex_id, steam_id, spotify_id, etc.) into a user
   * object returned by /auth/me. Non-critical — ignores fetch errors.
   */
  async function mergeIntegrations(user: User): Promise<void> {
    try {
      const intRes = await apiClient.get('/auth/me/integrations')
      Object.assign(user, intRes.data)
    } catch {
      // Non-critical — user still has core profile
    }
  }

  async function loadUser(token: string): Promise<User | null> {
    try {
      const meRes = await apiClient.get('/auth/me')
      const user = meRes.data as User
      await mergeIntegrations(user)
      return user
    } catch {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      return null
    }
  }

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) {
      setIsLoading(false)
      return
    }
    loadUser(token).then((user) => {
      setUser(user)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      // Don't clear all caches — only auth-dependent queries need invalidation.
      // Individual queries already get 401 and show errors; clearing non-auth
      // caches (discover, browse) causes unnecessary flicker.
      queryClient.invalidateQueries({ queryKey: ['workout'] })
      queryClient.invalidateQueries({ queryKey: ['workouts'] })
    }
    window.addEventListener('auth:sessionExpired', handler)
    return () => window.removeEventListener('auth:sessionExpired', handler)
  }, [])

  // Handle otix:// deep links (OAuth return from system browser)
  useDeepLink(
    useCallback(
      (data) => {
        // otix://auth/steam/callback?accessToken=xxx
        if (data.action === 'auth/steam/callback' && data.params.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.params.accessToken)
          loadUser(data.params.accessToken).then(setUser)
        }

        // otix://auth/steam/connect/callback — refresh integrations
        if (data.action === 'auth/steam/connect/callback') {
          queryClient.invalidateQueries({ queryKey: ['integrations'] })
        }

        // otix://refocus — no-op, just brought app to foreground
      },
      [],
    ),
  )

  const login = useCallback(async (identity: string, password: string) => {
    const res = await apiClient.post('/auth/login', { identity, password })
    const data = res.data as LoginResponse

    if (data.twoFactorRequired && data.challengeToken) {
      setTwoFactorChallenge({ challengeToken: data.challengeToken })
      return
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken!)
    // Don't clear cache on login — setUser triggers auth-gated queries to
    // become enabled and refetch naturally based on staleTime. Clearing here
    // would force every mounted query to refetch simultaneously (request storm).
    const me = await apiClient.get('/auth/me')
    const user = me.data as User
    await mergeIntegrations(user)
    setUser(user)
  }, [])

  const verifyTwoFactor = useCallback(async (code: string) => {
    if (!twoFactorChallenge) throw new Error('No 2FA challenge in progress')

    const res = await apiClient.post('/auth/2fa/login/verify', {
      challenge_token: twoFactorChallenge.challengeToken,
      code,
    })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.accessToken)
    setTwoFactorChallenge(null)
    // Don't clear cache — same rationale as login handler.
    const me = await apiClient.get('/auth/me')
    const user = me.data as User
    await mergeIntegrations(user)
    setUser(user)
  }, [twoFactorChallenge])

  const cancelTwoFactor = useCallback(() => {
    setTwoFactorChallenge(null)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string, dateOfBirth: string) => {
    const res = await apiClient.post('/auth/register', { email, username, password, date_of_birth: dateOfBirth })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.accessToken)
    // Don't clear cache on register — new user, no stale data to remove.
    const me = await apiClient.get('/auth/me')
    const user = me.data as User
    await mergeIntegrations(user)
    setUser(user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // ignore errors during logout
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    setUser(null)
    setTwoFactorChallenge(null)
    // Safe to clear on logout: setUser(null) disables auth-gated queries
    // so they won't refetch. This wipes user-specific data from cache.
    queryClient.clear()
  }, [])

  const refreshUser = useCallback(async () => {
    const me = await apiClient.get('/auth/me')
    const user = me.data as User
    await mergeIntegrations(user)
    setUser(user)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        twoFactorChallenge,
        login,
        verifyTwoFactor,
        cancelTwoFactor,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
