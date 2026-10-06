import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { extractErrorMessage } from '@auth/utils'

import { PENDING_LOGIN_SYNC_KEY } from '@/features/interaction/offline-watchlist'
import { SERVICES, handleCallback } from '../utils/callback'

export const CallbackPage = () => {
  const navigate = useNavigate()
  const { service } = useParams({ strict: false }) as { service?: string }
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    const cfg = service ? SERVICES[service] : null
    if (!cfg || called.current) return
    called.current = true

    const params = new URLSearchParams(window.location.search)

    handleCallback(cfg, params)
      .then(() => {
        // OAuth login flows reload the app after this page, so the renderer
        // can't catch a login event — flag it for the sync prompt instead.
        if (cfg.isLogin) {
          try { localStorage.setItem(PENDING_LOGIN_SYNC_KEY, '1') } catch { /* ignore */ }
        }
        const source = params.get('source')
        if (source === 'desktop') {
          window.location.href = `otix://auth/callback/${service}?success=true`
          return
        }

        setDone(true)
        if (cfg.successNav) setTimeout(() => navigate(cfg.successNav!), cfg.name === 'Steam' ? 1200 : 600)
      })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [navigate, service])

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

  const title = done ? `${cfg.name} Linked` : error ? 'Link Failed' : `Linking ${cfg.name} Account`
  const desc = error ? error : done ? (cfg.successMsg ?? `Your ${cfg.name} account has been linked successfully.`) : (cfg.loadingMsg ?? `Verifying with ${cfg.name}...`)

  return (
    <div id="auth-callback-page" className="relative flex min-h-screen items-center justify-center p-4">
      <AuthBackground />
      <Helmet><title>{error ? 'Link Failed' : title} - Otix</title></Helmet>
      <AuthCard>
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${done ? 'bg-green-500/10' : error ? 'bg-red-500/10' : 'bg-white/5'}`}>
          {done ? <Check className="h-7 w-7 text-green-500" /> : error ? <XCircle className="h-7 w-7 text-red-500" /> : <Loader2 className="h-7 w-7 animate-spin" style={{ color: cfg.loadingColor ?? 'var(--primary)' }} />}
        </div>
        <h2 className="mb-2 text-xl font-bold">{error ? 'Link Failed' : title}</h2>
        {error ? (
          <p className="mb-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{desc}</p>
        )}
        {done && !error && (
          <p className="mt-1 text-xs" style={{ color: 'color-mix(in srgb, var(--muted-foreground) 60%, transparent)' }}>Close this tab and return to Otix.</p>
        )}
        {error && cfg.errorNav && (
          <div className="mt-6">
            <button onClick={() => navigate(cfg.errorNav!)} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              {cfg.name === 'Steam' ? 'Back to Sign In' : 'Back to Settings'}
            </button>
          </div>
        )}
      </AuthCard>
    </div>
  )
};
