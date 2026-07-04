import { useEffect } from 'react'
import { useAuth } from '@auth/hooks/use-auth'
import { router } from '@/lib/router'

export function AuthRouterBridge() {
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    router.update({
      context: {
        ...router.options.context,
        isAuthenticated,
        isAuthLoaded: !isLoading,
      },
    })
  }, [isAuthenticated, isLoading])

  return null
}
