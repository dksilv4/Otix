import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api/client'
import { resetAuthRefreshState } from '@/lib/api/session-refresh'
import { emitOtixEvent } from '@/lib/plugin-events'
import { queryClient } from '@/lib/query/client'
import type { User, TwoFactorChallenge, LoginResponse } from '@auth/types'
import { AuthContext } from '@auth/hooks/use-auth'
import { useDeepLink } from '@auth/hooks/use-deep-link'

import { ACCESS_TOKEN_KEY } from '@/lib/config'

async function fetchAuthenticatedUser(): Promise<User | null> {
  try {
    const [meRes, intRes] = await Promise.all([
      apiClient.get('/auth/me'),
      apiClient.get('/auth/me/integrations').catch(() => null),
    ])
    const user = meRes.data as User
    if (intRes?.data) Object.assign(user, intRes.data)
    return user
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401 || status === 403) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.desktopAPI?.plugin?.setAuthToken(null)
    }
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem(ACCESS_TOKEN_KEY))
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null)

  // Initialize auth state — runs once on mount
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return
    window.desktopAPI?.plugin?.setAuthToken(token)
    fetchAuthenticatedUser().then((user) => {
      setUser(user)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.desktopAPI?.plugin?.setAuthToken(null)
      queryClient.clear()
    }
    window.addEventListener('auth:sessionExpired', handler)
    return () => window.removeEventListener('auth:sessionExpired', handler)
  }, [])

  // Handle otix:// deep links (OAuth return from system browser)
  useDeepLink(
    useCallback(
      (data) => {
        if (data.action === 'auth/callback/steam' && data.params.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, data.params.accessToken)
          window.desktopAPI?.plugin?.setAuthToken(data.params.accessToken)
          resetAuthRefreshState()
          fetchAuthenticatedUser().then((loaded) => {
            setUser(loaded)
            if (loaded) emitOtixEvent('otix:user:login', { userId: loaded.id })
          })
        }

        if (data.action === 'auth/callback/steam-connect') {
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
      return data
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken!)
    window.desktopAPI?.plugin?.setAuthToken(data.accessToken!)
    resetAuthRefreshState()
    const user = await fetchAuthenticatedUser()
    setUser(user)
    if (user) emitOtixEvent('otix:user:login', { userId: user.id })
    return data
  }, [])

  const verifyTwoFactor = useCallback(async (code: string) => {
    if (!twoFactorChallenge) throw new Error('No 2FA challenge in progress')

    const res = await apiClient.post('/auth/2fa/login/verify', {
      challenge_token: twoFactorChallenge.challengeToken,
      code,
    })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.accessToken)
    window.desktopAPI?.plugin?.setAuthToken(res.data.accessToken)
    resetAuthRefreshState()
    setTwoFactorChallenge(null)
    const user = await fetchAuthenticatedUser()
    setUser(user)
    if (user) emitOtixEvent('otix:user:login', { userId: user.id })
  }, [twoFactorChallenge])

  const cancelTwoFactor = useCallback(() => {
    setTwoFactorChallenge(null)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string, dateOfBirth: string) => {
    const res = await apiClient.post('/auth/register', { email, username, password, date_of_birth: dateOfBirth })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.accessToken)
    window.desktopAPI?.plugin?.setAuthToken(res.data.accessToken)
    resetAuthRefreshState()
    const user = await fetchAuthenticatedUser()
    setUser(user)
    if (user) emitOtixEvent('otix:user:login', { userId: user.id })
  }, [])

  const logout = useCallback(async () => {
    const userId = user?.id
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // ignore errors during logout
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    window.desktopAPI?.plugin?.setAuthToken(null)
    setUser(null)
    setTwoFactorChallenge(null)
    queryClient.clear()
    if (userId) {
      emitOtixEvent('otix:user:logout', { userId })
    }
  }, [user])

  const refreshUser = useCallback(async () => {
    setUser(await fetchAuthenticatedUser())
  }, [])

  const contextValue = useMemo(() => ({
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
  }), [user, isLoading, twoFactorChallenge, login, verifyTwoFactor, cancelTwoFactor, register, logout, refreshUser])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}
