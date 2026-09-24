import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api/client'
import { resetAuthRefreshState } from '@/lib/api/session-refresh'
import { emitOtixEvent } from '@/lib/plugin-events'
import { queryClient } from '@/lib/query/client'
import type { User, TwoFactorChallenge, LoginResponse } from '@auth/types'
import { AuthContext } from '@auth/hooks/use-auth'
import { useDeepLink } from '@auth/hooks/use-deep-link'

import { ACCESS_TOKEN_KEY } from '@/lib/config'

const CACHED_USER_KEY = 'otix_cached_user'

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function setCachedUser(user: User | null): void {
  try {
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(CACHED_USER_KEY)
    }
  } catch {
    // Storage full or unavailable
  }
}

async function fetchAuthenticatedUser(): Promise<User | null> {
  try {
    const [meRes, intRes] = await Promise.all([
      apiClient.get('/auth/me'),
      apiClient.get('/auth/me/integrations').catch(() => null),
    ])
    const user = meRes.data as User
    if (intRes?.data) Object.assign(user, intRes.data)
    setCachedUser(user)
    return user
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401 || status === 403) {
      setCachedUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.desktopAPI?.plugin?.setAuthToken(null)
    }
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    return token ? getCachedUser() : null
  })
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') return false
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return false
    return !getCachedUser()
  })
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null)

  // Initialize auth state — runs once on mount
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) return
    window.desktopAPI?.plugin?.setAuthToken(token)
    fetchAuthenticatedUser().then((loadedUser) => {
      setUser(loadedUser)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      setUser(null)
      setCachedUser(null)
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
    setCachedUser(null)
    window.desktopAPI?.plugin?.setAuthToken(null)
    setUser(null)
    setTwoFactorChallenge(null)
    queryClient.clear()
    if (userId) {
      emitOtixEvent('otix:user:logout', { userId })
    }
  }, [user])

  const refreshUser = useCallback(async () => {
    const loaded = await fetchAuthenticatedUser()
    setUser(loaded)
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
