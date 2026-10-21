import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api/client'
import { resetAuthRefreshState } from '@/lib/api/session-refresh'
import { emitOtixEvent } from '@/lib/plugin-events'
import { queryClient } from '@/lib/query/client'
import type { User, TwoFactorChallenge, LoginResponse } from '@auth/types'
import { AuthContext } from '@auth/hooks/use-auth'
import { useDeepLink } from '@auth/hooks/use-deep-link'
import { useDeviceSync } from '@/features/settings/hooks/use-device-sync'
import { xpGainListeners } from '@ui/atoms/xp-toast'

import { ACCESS_TOKEN_KEY } from '@/lib/config'
import {
  getCachedUser,
  setCachedUser,
  fetchAuthenticatedUser,
} from '@auth/utils'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
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

  // Register device node and sync offline pending updates when online
  useDeviceSync(user, !!user)

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
      localStorage.removeItem('otix:cached-servers')
      localStorage.removeItem('otix:settings-selected-node')
      window.desktopAPI?.plugin?.setAuthToken(null)
      queryClient.clear()
    }
    window.addEventListener('auth:sessionExpired', handler)
    return () => window.removeEventListener('auth:sessionExpired', handler)
  }, [])

  useEffect(() => {
    const handler = (amount: number) => {
      setUser((prev) => {
        if (!prev) return null
        const currentXp = prev.totalXp ?? 0
        const nextXp = currentXp + amount
        const updated = { ...prev, totalXp: nextXp }
        setCachedUser(updated)
        if (prev.username) {
          queryClient.invalidateQueries({ queryKey: ['user', prev.username] })
        }
        return updated
      })
    }
    xpGainListeners.add(handler)
    return () => {
      xpGainListeners.delete(handler)
    }
  }, [])

  const completeLogin = useCallback(async (accessToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    window.desktopAPI?.plugin?.setAuthToken(accessToken)
    resetAuthRefreshState()
    const loaded = await fetchAuthenticatedUser()
    setUser(loaded)
    if (loaded) emitOtixEvent('otix:user:login', { userId: loaded.id })
    return loaded
  }, [])

  // Handle otix:// deep links (OAuth return from system browser)
  useDeepLink(
    useCallback(
      (data) => {
        if (data.params?.accessToken) {
          completeLogin(data.params.accessToken).then(() => {
            import('@/lib/router').then(({ router }) => {
              const currentPath = router.state.location.pathname
              if (currentPath.startsWith('/auth/')) {
                void router.navigate({ to: '/' })
              }
            }).catch(() => {})
          })
        }

        if (data.action?.startsWith('auth/callback/') && !data.params?.accessToken) {
          queryClient.invalidateQueries({ queryKey: ['integrations'] })
          queryClient.invalidateQueries({ queryKey: ['user'] })
          window.dispatchEvent(new CustomEvent('otix:integrations:refresh'))
        }
      },
      [completeLogin],
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
    localStorage.removeItem('otix:cached-servers')
    localStorage.removeItem('otix:settings-selected-node')
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
    completeLogin,
    verifyTwoFactor,
    cancelTwoFactor,
    register,
    logout,
    refreshUser,
  }), [
    user,
    isLoading,
    twoFactorChallenge,
    login,
    completeLogin,
    verifyTwoFactor,
    cancelTwoFactor,
    register,
    logout,
    refreshUser,
  ])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
};
