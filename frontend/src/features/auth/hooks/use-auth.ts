import { createContext, useContext } from 'react'
import type { AuthState } from '@auth/types'

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext)
}

/** True while a session token is being verified or a user is already loaded. */
export function useHasSession(): boolean {
  const { isAuthenticated, isLoading } = useAuth()
  return isAuthenticated || isLoading
}
