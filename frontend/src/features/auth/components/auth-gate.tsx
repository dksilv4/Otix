import { type ReactNode } from 'react'
import { AppLoadingScreen } from '@ui/organisms/app-loading-screen'

interface AuthGateProps {
  children: ReactNode
}

/**
 * Top-level application gate that renders children underneath an impassable,
 * non-interactive loading screen until the app (auth, cache, IPC, and real-time updates)
 * is fully ready to be displayed.
 */
export const AuthGate = ({ children }: AuthGateProps) => {
  return (
    <>
      {children}
      <AppLoadingScreen />
    </>
  )
}

