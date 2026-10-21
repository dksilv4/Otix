import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { useAuth } from '@auth/hooks/use-auth'
import { extractErrorMessage } from '@auth/utils'

import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { PENDING_LOGIN_SYNC_KEY } from '@/features/interaction/offline-watchlist'
import { SERVICES, handleCallback } from '../utils/callback'

export const CallbackPage = () => {
  const navigate = useNavigate()
  const { service } = useParams({ strict: false }) as { service?: string }
  const { completeLogin, isAuthenticated } = useAuth()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [isDesktopDone, setIsDesktopDone] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    const cfg = service ? SERVICES[service] : null
    if (!cfg || called.current) return
    called.current = true

    const params = new URLSearchParams(window.location.search)

    handleCallback(cfg, params)
      .then(async (data) => {
        const isLoginFlow = Boolean(
          cfg.isLogin ||
          data?.accessToken ||
          (data as Record<string, unknown> | null)?.access_token
        )
        const token =
          (data?.accessToken as string | undefined) ||
          ((data as Record<string, unknown> | null)?.access_token as string | undefined) ||
          (isLoginFlow ? localStorage.getItem(ACCESS_TOKEN_KEY) : null)

        // OAuth login flows reload or redirect the app, flag for the sync prompt
        if (isLoginFlow) {
          try { localStorage.setItem(PENDING_LOGIN_SYNC_KEY, '1') } catch { /* ignore */ }
        }

        const source = (data?.source as string) || params.get('source')
        if (source === 'desktop') {
          const tokenParam = token ? `&accessToken=${encodeURIComponent(token)}` : ''
          window.location.href = `otix://auth/callback/${service}?success=true${tokenParam}`
          setIsDesktopDone(true)
          setDone(true)
          return
        }

        // Web OAuth login: update AuthProvider session state and navigate immediately into the app
        if (isLoginFlow && token) {
          await completeLogin(token)
          const redirectParam = params.get('redirect') || params.get('next')
          const target = (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//'))
            ? redirectParam
            : '/'
          void navigate({ to: target, replace: true })
          return
        }

        setDone(true)
        if (cfg.successNav) setTimeout(() => navigate(cfg.successNav!), cfg.name === 'Steam' ? 1200 : 600)
      })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [completeLogin, navigate, service])

  const cfg = service ? SERVICES[service] : null
  if (!cfg) {
    return (
      <div id="auth-callback-page" className="relative flex min-h-screen items-center justify-center p-4">
        <AuthBackground />
        <Helmet><title>Invalid - Otix</title></Helmet>
        <AuthCard>
          <p className="text-sm text-muted-foreground">Invalid callback URL.</p>
        </AuthCard>
      </div>
    )
  }

  const isLoginFlow = Boolean(cfg.isLogin)
  const title = done
    ? (isDesktopDone
        ? (isLoginFlow ? 'Signed In to Desktop' : `${cfg.name} Linked to Desktop`)
        : (isLoginFlow ? 'Signed In' : `${cfg.name} Linked`))
    : error
      ? (isLoginFlow ? 'Sign In Failed' : 'Link Failed')
      : (isLoginFlow ? `Signing in with ${cfg.name}` : `Linking ${cfg.name} Account`)

  const desc = error
    ? error
    : done
      ? (isDesktopDone
          ? (isLoginFlow ? 'You are now signed in on Otix desktop.' : `Your ${cfg.name} account has been linked to Otix desktop.`)
          : (cfg.successMsg ?? (isLoginFlow ? 'Signed in successfully.' : `Your ${cfg.name} account has been linked successfully.`)))
      : (cfg.loadingMsg ?? (isLoginFlow ? `Signing in with ${cfg.name}...` : `Verifying with ${cfg.name}...`))

  return (
    <div id="auth-callback-page" className="relative flex min-h-screen items-center justify-center p-4">
      <AuthBackground />
      <Helmet><title>{title} - Otix</title></Helmet>
      <AuthCard>
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
            done
              ? 'bg-primary/10 text-primary'
              : error
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted/10 text-primary'
          }`}
        >
          {done ? (
            <Check className="h-7 w-7" />
          ) : error ? (
            <XCircle className="h-7 w-7" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin" />
          )}
        </div>
        <h2 className="mb-2 text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
        {done && !error && isDesktopDone && (
          <p className="mt-1 text-xs text-muted-foreground/60">You can close this tab and return to Otix.</p>
        )}
        {error && (
          <div className="mt-6">
            <button
              onClick={() => {
                const fallbackNav = (isLoginFlow || !isAuthenticated)
                  ? { to: '/auth/login', replace: true }
                  : (cfg.errorNav ?? { to: '/settings/connections', replace: true })
                void navigate(fallbackNav)
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {isLoginFlow || !isAuthenticated ? 'Back to Sign In' : 'Back to Settings'}
            </button>
          </div>
        )}
      </AuthCard>
    </div>
  )
}
