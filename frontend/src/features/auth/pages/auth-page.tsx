import { useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@auth'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { LoginForm } from '@auth/components/organisms/auth-login-form'
import { TwoFactorChallenge } from '@auth/components/organisms/auth-two-factor-challenge'
import { OAuthContainer } from '@auth/components/organisms/auth-oauth-container'
import { SteamOAuthButton } from '@auth/components/molecules/auth-steam-oauth-button'
import { Logo } from '@/old-features/dk-ui/atoms/logo'

export function AuthPage() {
  const { twoFactorChallenge, cancelTwoFactor } = useAuth()
  const navigate = useNavigate()
  const redirect = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('redirect') || '/'
    : '/'
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  const handleSuccess = useCallback(() => navigate({ to: redirect }), [navigate, redirect])
  const handleTwoFactorCancel = useCallback(() => cancelTwoFactor(), [cancelTwoFactor])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Helmet>
        <title>Sign In - Otix</title>
        <meta name="description" content="Sign in to Otix to continue your journey." />
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
          title="Welcome back"
          subtitle="Sign in to continue your journey"
        />

        {twoFactorChallenge ? (
          <TwoFactorChallenge onSuccess={handleSuccess} onCancel={handleTwoFactorCancel} />
        ) : (
          <>
            <LoginForm onSuccess={handleSuccess} />

            <p className="mt-8 text-xs text-muted-foreground">
              Don't have an account?{' '}
              <a
                href="/auth/register"
                onClick={(e) => { e.preventDefault(); navigate({ to: '/auth/register' }) }}
                className="text-primary transition-colors hover:text-primary/80"
              >
                Create one
              </a>
            </p>
          </>
        )}
      </AuthCard>

      {!twoFactorChallenge && (
        <OAuthContainer id="auth-oauth">
          <SteamOAuthButton />
        </OAuthContainer>
      )}
    </div>
  )
}
