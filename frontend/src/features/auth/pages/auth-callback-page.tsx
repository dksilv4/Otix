import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'
import { extractErrorMessage } from '../utils'

const ACCESS_TOKEN_KEY = 'otix-access-token'

interface ServiceCfg {
  name: string
  endpoint: string
  loadingColor?: string
  useOpenId?: boolean
  loadingMsg?: string
  successMsg?: string
  validateParams?: (p: URLSearchParams) => string | null
  buildBody: (p: URLSearchParams) => Record<string, unknown> | null
  onSuccess?: (data: Record<string, unknown>) => void
  successNav?: Record<string, unknown>
  errorNav?: Record<string, unknown>
}

const SERVICES: Record<string, ServiceCfg> = {
  google: {
    name: 'Google', endpoint: '/auth/oauth/google/callback', loadingColor: '#4285F4',
    validateParams: (p) =>
      p.get('error') ? 'Google authorization was denied.' :
      !p.get('code') || !p.get('state') ? 'Google did not return the expected authorization details.' : null,
    buildBody: (p) => ({ code: p.get('code'), state: p.get('state') }),
    successNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
    errorNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
  },
  plex: {
    name: 'Plex', endpoint: '/auth/oauth/plex/callback',
    buildBody: (p) => ({ state: p.get('state'), pinId: p.get('pinId') || undefined }),
    successNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
    errorNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
  },
  spotify: {
    name: 'Spotify', endpoint: '/auth/oauth/spotify/callback', loadingColor: '#1db954',
    validateParams: (p) =>
      p.get('error') ? 'Spotify authorization was denied.' :
      !p.get('code') || !p.get('state') ? 'Spotify did not return the expected authorization details.' : null,
    buildBody: (p) => ({ code: p.get('code'), state: p.get('state') }),
    successNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
    errorNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
  },
  tmdb: {
    name: 'TMDb', endpoint: '/auth/oauth/tmdb/callback', loadingColor: '#01b4e4',
    validateParams: (p) => {
      if (p.get('tmdb_link') === 'error') return p.get('message') || 'Failed to link TMDb account.'
      if (p.get('approved') === 'false') return 'TMDb authorization was cancelled.'
      return null
    },
    buildBody: (p) => {
      if (p.get('tmdb_link') === 'success') return null
      const state = p.get('state')
      const requestToken = p.get('request_token')
      return state && requestToken ? { state, request_token: requestToken } : null
    },
    successNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
    errorNav: { to: '/settings', search: { section: 'integrations' }, replace: true },
  },
  steam: {
    name: 'Steam', endpoint: '/auth/steam/callback', useOpenId: true,
    loadingMsg: 'Verifying your Steam account...',
    successMsg: 'Signed in successfully.',
    buildBody: () => null,
    onSuccess: (data) => { localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken as string) },
    successNav: { to: '/', replace: true },
    errorNav: { to: '/auth/login', replace: true },
  },
  'steam-connect': {
    name: 'Steam', endpoint: '/auth/oauth/steam/callback', useOpenId: true,
    loadingMsg: 'Linking your Steam account...',
    successMsg: 'Your Steam account has been linked.',
    buildBody: () => null,
    onSuccess: () => { apiClient.post('/integrations/steam/scan').catch(() => {}) },
    successNav: { to: '/library/$tab', params: { tab: 'steam' }, replace: true },
    errorNav: { to: '/settings', replace: true },
  },
}

function collectOpenId(p: URLSearchParams) {
  const params: Record<string, string> = {}
  for (const [key, value] of p.entries()) {
    if (key.startsWith('openid.') || key === 'state') params[key] = value
  }
  const rawQuery = window.location.search.replace(/^\?/, '')
  return { params, rawQuery }
}

async function handleCallback(cfg: ServiceCfg, params: URLSearchParams): Promise<void> {
  if (cfg.useOpenId) {
    const oid = collectOpenId(params)
    const body = { params: oid.params, rawQuery: oid.rawQuery }
    const { data } = await apiClient.post(cfg.endpoint, body)
    cfg.onSuccess?.(data)
  } else {
    const paramErr = cfg.validateParams?.(params) ?? null
    if (paramErr) throw new Error(paramErr)
    const body = cfg.buildBody(params)
    if (body) await apiClient.post(cfg.endpoint, body)
  }
}

export function CallbackPage() {
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
      <div id="callback-page" className="flex min-h-screen items-center justify-center p-4">
        <Helmet><title>Invalid - Otix</title></Helmet>
        <div className="w-full max-w-sm rounded-[2rem] p-8 text-center" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Invalid callback URL.</p>
        </div>
      </div>
    )
  }

  const title = done ? `${cfg.name} Linked` : error ? 'Link Failed' : `Linking ${cfg.name} Account`
  const desc = error ? error : done ? (cfg.successMsg ?? `Your ${cfg.name} account has been linked successfully.`) : (cfg.loadingMsg ?? `Verifying with ${cfg.name}...`)

  return (
    <div id="callback-page" className="flex min-h-screen items-center justify-center p-4">
      <Helmet><title>{error ? 'Link Failed' : title} - Otix</title></Helmet>
      <div className="w-full max-w-sm rounded-[2rem] p-8 text-center" style={{ backgroundColor: 'var(--dk-surface-base)', animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
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
      </div>
    </div>
  )
}
