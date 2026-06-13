import { useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from '@tanstack/react-router'
import { AuthHeader } from '@/features/auth'
import { AuthCard } from '@/features/auth/molecules/auth-card'
import { RegisterForm } from '@/features/auth'
import { Logo } from '@ui/atoms/logo'

export function AuthRegisterPage() {
  const navigate = useNavigate()
  const redirect = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') || '/' : '/'

  const handleSuccess = useCallback(() => navigate({ to: redirect }), [navigate, redirect])

  return (
    <>
      <Helmet>
        <title>Create Account - Otix</title>
        <meta name="description" content="Create an account on Otix to track movies, shows, games, and music." />
        <meta name="robots" content="noindex" />
      </Helmet>

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
    </>
  )
}
