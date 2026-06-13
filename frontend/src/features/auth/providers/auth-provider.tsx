import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import type { User, TwoFactorChallenge, LoginResponse } from '@auth/types'
import { AuthContext } from '@auth/hooks/use-auth'
import { useDeepLink } from '@auth/hooks/use-deep-link'

const ACCESS_TOKEN_KEY = 'otix-access-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem(ACCESS_TOKEN_KEY))
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null)

  async function mergeIntegrations(user: User): Promise<void> {
    try {
      const intRes = await apiClient.get('/auth/me/integrations')
      Object.assign(user, intRes.data)
    } catch {
      // Non-critical — user still has core profile
    }
  }

  async function loadUser(): Promise<User | null> {
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

  // Initialize auth state — runs once on mount
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return
    loadUser().then((user) => {
      setUser(user)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
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
        if (data.action === 'auth/steam/callback' && data.params.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.params.accessToken)
          loadUser().then(setUser)
        }

        if (data.action === 'auth/steam/connect/callback') {
          queryClient.invalidateQueries({ queryKey: ['integrations'] })
        }
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
