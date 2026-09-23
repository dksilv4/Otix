import { type ReactNode } from 'react'
import { useAuth } from '@auth/hooks/use-auth'
import { Logo } from '@ui/atoms/logo'

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

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]"
      aria-label="Loading Otix…"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-6">
        <Logo
          className="h-16 animate-pulse opacity-90"
          variant="infinity"
        />

        {/* Three-dot pulse indicator */}
        <div className="flex items-center gap-1.5" aria-hidden>
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  )
}
