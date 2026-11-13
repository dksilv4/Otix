import { useCallback, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { getSafeRedirectUrl } from '@auth/utils'
import { useAuth } from '@auth/hooks/use-auth'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { RegisterForm } from '@auth/components/organisms/auth-register-form'
import { OAuthContainer } from '@auth/components/organisms/auth-oauth-container'
import { GoogleOAuthButton } from '@auth/components/molecules/auth-oauth-google-button'
import { PlexOAuthButton } from '@auth/components/molecules/auth-oauth-plex-button'
import { TmdbOAuthButton } from '@auth/components/molecules/auth-oauth-tmdb-button'
import { SteamOAuthButton } from '@auth/components/molecules/auth-oauth-steam-button'
import { Logo } from '@ui/atoms/logo'

export const RegisterPage = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const search = useSearch({ strict: false }) as { redirect?: string }
  const rawRedirect = search?.redirect ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : undefined)
  const redirect = getSafeRedirectUrl(rawRedirect)

  useEffect(() => {
    if (redirect && redirect !== '/') {
      try { sessionStorage.setItem('auth_redirect', redirect) } catch { /* ignore */ }
    }
  }, [redirect])

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: redirect })
    }
  }, [isAuthenticated, navigate, redirect])

  const handleSuccess = useCallback(() => {
    try { sessionStorage.removeItem('auth_redirect') } catch { /* ignore */ }
    void navigate({ to: redirect })
  }, [navigate, redirect])

  return (
    <div id="auth-register-page" className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4 py-8">
      <Helmet>
        <title>Create Account - Otix</title>
        <meta name="description" content="Create an account on Otix to track movies, shows, games, and music." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <AuthBackground />

      <AuthCard>
        <div className="mb-6 flex justify-center">
          <Logo className="h-20 drop-shadow-2xl" />
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
            onClick={(e) => {
              e.preventDefault();
              navigate({
                to: '/auth/login',
                search: redirect && redirect !== '/' ? { redirect } : undefined,
              })
            }}
            className="text-primary transition-colors hover:text-primary/80"
          >
            Sign in
          </a>
        </p>

        <p className="mt-4 text-[11px] text-muted-foreground/80 text-center leading-normal">
          By signing up, you agree to Otix&apos;s{' '}
          <a
            href="/terms"
            onClick={(e) => { e.preventDefault(); navigate({ to: '/terms' }) }}
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            onClick={(e) => { e.preventDefault(); navigate({ to: '/privacy' }) }}
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Privacy Policy
          </a>
          .
        </p>
      </AuthCard>

      <OAuthContainer id="auth-register-oauth">
        <GoogleOAuthButton />
        <PlexOAuthButton />
        <TmdbOAuthButton />
        <SteamOAuthButton />
      </OAuthContainer>
    </div>
  )
};
