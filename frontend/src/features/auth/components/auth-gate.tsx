import { type ReactNode } from 'react'
import { useAuth } from '@auth/hooks/use-auth'
import { OtixLoadingScreen } from '@ui/atoms/otix-loading-screen'

interface AuthGateProps {
  children: ReactNode
}

/**
 * Blocks rendering until the auth state is resolved.
 *
 * When a token exists in localStorage, the AuthProvider fires a request to
 * /auth/me to validate it. During that window `isLoading` is true and we show
 * a full-screen splash so no page — protected or otherwise — renders until we
 * know who the user is (or isn't).
 *
 * Users with no stored token bypass the gate entirely and see the app
 * immediately.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { isLoading } = useAuth()

  if (!isLoading) return <>{children}</>

  return <OtixLoadingScreen className="fixed inset-0 z-[9999]" />
}
