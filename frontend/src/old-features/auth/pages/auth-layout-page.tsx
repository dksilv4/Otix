import { useEffect } from 'react'
import { Outlet, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { AuthBackground } from '@/old-features/auth/molecules/auth-card'

export function AuthLayout() {
  const router = useRouter()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  /* Detect browser autofill via animationstart (works cross-browser) */
  useEffect(() => {
    const handler = (e: AnimationEvent) => {
      if (e.animationName === 'onAutofillStart') {
        (e.target as HTMLElement)?.classList.add('input-autofilled')
      }
    }
    document.addEventListener('animationstart', handler)
    return () => document.removeEventListener('animationstart', handler)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <AuthBackground />

      {canGoBack && (
        <div className="fixed left-4 top-4 z-50">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-lg transition-colors hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <Outlet />
    </div>
  )
}
