import { useState, useCallback, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useLocation, useRouter } from '@tanstack/react-router'
import { LogIn, UserPlus, Loader2, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/features/auth'
import { AuthHeader } from '@/features/auth'
import { LoginForm } from '@/features/auth'
import { RegisterForm } from '@/features/auth'
import { TwoFactorChallenge } from '@/features/auth'
import { Logo } from '@ui/atoms/logo'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { isDesktop } from '@/lib/desktop-api'
import { openExternal } from '@/lib/open-external'
import { apiClient } from '@/lib/api-client'
import type { AuthFormMode } from '../types'

type FormMode = AuthFormMode

const tabSpring = { type: 'spring' as const, stiffness: 500, damping: 30 }

export function AuthPage() {
  const { isAuthenticated, isLoading, twoFactorChallenge, cancelTwoFactor } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const router = useRouter()
  const redirect = new URLSearchParams(location.search).get('redirect') || '/'
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  const [mode, setMode] = useState<FormMode>(
    location.pathname === '/auth/register' ? 'register' : 'login',
  )

  const switchMode = useCallback(
    (nextMode: FormMode) => {
      if (nextMode === mode) return
      setMode(nextMode)
      navigate({ to: nextMode === 'login' ? '/auth/login' : '/auth/register', replace: true })
    },
    [mode, navigate],
  )

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

  const isLogin = mode === 'login'
  const handleSuccess = useCallback(() => navigate({ to: redirect }), [navigate, redirect])
  const handleTwoFactorCancel = useCallback(() => cancelTwoFactor(), [cancelTwoFactor])

  return (
    <div id="auth-page" className="flex min-h-screen items-center justify-center p-4">
      <Helmet>
        <title>{isLogin ? 'Sign In - Otix' : 'Create Account - Otix'}</title>
        <meta name="description" content={isLogin ? 'Sign in to Otix to continue your journey.' : 'Create an account on Otix to track movies, shows, game, and music.'} />
        <meta name="robots" content="noindex" />
      </Helmet>

      {canGoBack && (
        <div className="fixed left-4 top-4 z-50">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <div
        id="auth-card"
        className="w-full max-w-sm rounded-[2rem] p-8 text-center"
        style={{
          backgroundColor: 'var(--dk-surface-base)',
          animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div id="auth-logo" className="mb-6 flex justify-center">
          <Logo className="h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
        </div>

        <AuthHeader
          title={isLogin ? 'Welcome back' : 'Join Otix'}
          subtitle={isLogin ? 'Sign in to continue your journey' : 'Create an account to get started'}
        />

        {twoFactorChallenge ? (
          <TwoFactorChallenge onSuccess={handleSuccess} onCancel={handleTwoFactorCancel} />
        ) : (
          <>
            <div id="auth-tabs" className="relative mb-6 flex rounded-xl bg-white/5 p-1">
              <motion.div
                className="absolute inset-y-1 rounded-lg bg-white/10"
                initial={false}
                animate={{ left: isLogin ? '0.25rem' : '50%', width: 'calc(50% - 0.25rem)' }}
                transition={tabSpring}
              />
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ' + (isLogin ? 'text-white' : 'text-white/50 hover:text-white/70')}
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ' + (!isLogin ? 'text-white' : 'text-white/50 hover:text-white/70')}
              >
                <UserPlus className="h-4 w-4" />
                Create Account
              </button>
            </div>

            <AnimatePresence mode="wait">
              {isLogin ? (
                <LoginForm key="login" onSuccess={handleSuccess} />
              ) : (
                <RegisterForm key="register" onSuccess={handleSuccess} />
              )}
            </AnimatePresence>

            <div id="auth-social" className="mt-6 space-y-3">
              <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>or continue with</p>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleSteamLogin}
                  disabled={steamLoading}
                  className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full transition-all hover:scale-105 disabled:opacity-50"
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
          </>
        )}
      </div>
    </div>
  )
}
