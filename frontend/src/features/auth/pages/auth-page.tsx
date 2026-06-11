import { useCallback, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { AuthHeader } from '@/features/auth'
import { AuthCard } from '@/features/auth/molecules/auth-card'
import { LoginForm } from '@/features/auth'
import { TwoFactorChallenge } from '@/features/auth'
import { Logo } from '@ui/atoms/logo'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { isDesktop } from '@/lib/desktop-api'
import { openExternal } from '@/lib/open-external'
import { apiClient } from '@/lib/api-client'

export function AuthPage() {
  const { twoFactorChallenge, cancelTwoFactor } = useAuth()
  const navigate = useNavigate()
  const router = useRouter()
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  const [steamLoading, setSteamLoading] = useState(false)

  async function handleSteamLogin() {
    setSteamLoading(true)
    try {
      const { data } = await apiClient.post('/auth/steam/initiate', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl)
    } catch {
      setSteamLoading(false)
    }
  }

  const handleSuccess = useCallback(() => navigate({ to: redirect }), [navigate, redirect])
  const handleTwoFactorCancel = useCallback(() => cancelTwoFactor(), [cancelTwoFactor])

  return (
    <div id="auth-page" className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Helmet>
        <title>Sign In - Otix</title>
        <meta name="description" content="Sign in to Otix to continue your journey." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="dk-auth-bg" />

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

      <AuthCard>
        <div id="auth-logo" className="mb-6 flex justify-center">
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
        <div
          id="auth-social"
          className="w-full max-w-sm rounded-[2rem] p-6 text-center"
          style={{
            backgroundColor: 'oklch(from var(--dk-surface-base) r g b / 0.4)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: 'var(--dk-shadow-glass)',
            animation: 'authFormFadeIn 0.5s var(--dk-ease-in-out)',
          }}
        >
          <p className="mb-4 text-xs text-muted-foreground">or continue with</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleSteamLogin}
              disabled={steamLoading}
              className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full backdrop-blur-lg transition-all hover:scale-105 disabled:opacity-50"
              aria-label="Continue with Steam"
              style={{ background: 'linear-gradient(135deg, #1b2838 0%, #1d3f5f 100%)' }}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity hover:opacity-100" style={{ background: 'linear-gradient(135deg, #1b2838 0%, #1d3f5f 100%)', filter: 'brightness(1.2)' }} />
              {steamLoading ? (
                <Loader2 className="relative z-10 h-5 w-5 animate-spin" />
              ) : (
                <SteamIcon className="relative z-10 h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
