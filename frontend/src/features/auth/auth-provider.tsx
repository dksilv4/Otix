import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiClient } from '@/lib/api-client'
import type { User, AuthState } from './types'

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

  // Check if we have a valid session on mount
  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    if (!token) {
      setIsLoading(false)
      return
    }
    apiClient
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem(ACCESS_TOKEN_KEY))
      .finally(() => setIsLoading(false))
  }, [])

  // Listen for session expiration from the API client's refresh failure
  useEffect(() => {
    const handler = () => {
      setUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
    }
    window.addEventListener('auth:sessionExpired', handler)
    return () => window.removeEventListener('auth:sessionExpired', handler)
  }, [])

  const login = useCallback(async (identity: string, password: string) => {
    const res = await apiClient.post('/auth/login', { identity, password })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.access_token)
    const me = await apiClient.get('/auth/me')
    setUser(me.data)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string) => {
    const res = await apiClient.post('/auth/register', { email, username, password })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.access_token)
    const me = await apiClient.get('/auth/me')
    setUser(me.data)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // ignore errors during logout
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
