import { useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { RegisterForm } from '@auth/components/organisms/auth-register-form'
import { Logo } from '@/old-features/dk-ui/atoms/logo'

export function RegisterPage() {
  const navigate = useNavigate()
  const redirect = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('redirect') || '/'
    : '/'
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  const handleSuccess = useCallback(() => navigate({ to: redirect }), [navigate, redirect])

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <Helmet>
        <title>Create Account - Otix</title>
        <meta name="description" content="Create an account on Otix to track movies, shows, games, and music." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <AuthBackground />

      {canGoBack && (
        <div className="fixed left-4 top-4 z-50">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-lg transition-colors hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <AuthCard>
        <div className="mb-6 flex justify-center">
          <Logo className="h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
        </div>

        <AuthHeader
          title="Join Otix"
          subtitle="Create an account to get started"
        />

        <RegisterForm onSuccess={handleSuccess} />

        <p className="mt-8 text-xs text-muted-foreground">
          Already have an account?{' '}
          <a
            href="/auth/login"
            onClick={(e) => { e.preventDefault(); navigate({ to: '/auth/login' }) }}
            className="text-primary transition-colors hover:text-primary/80"
          >
            Sign in
          </a>
        </p>
      </AuthCard>
    </div>
  )
}
