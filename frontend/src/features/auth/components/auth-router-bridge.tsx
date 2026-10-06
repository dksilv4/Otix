import { useEffect } from 'react'
import { useAuth } from '@auth/hooks/use-auth'
import { router } from '@/lib/router'

export const AuthRouterBridge = () => {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    router.update({
      context: {
        ...router.options.context,
        isAuthenticated,
        isAuthLoaded: !isLoading,
      },
    })
    // Re-run all active beforeLoad guards with the fresh auth context so
    // protected routes redirect immediately after login/logout.
    void router.invalidate()
  }, [isAuthenticated, isLoading])

  return null
};
