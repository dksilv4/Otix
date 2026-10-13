import { apiClient } from '@/lib/api/client'
import { ACCESS_TOKEN_KEY } from '@/lib/config'

export interface ServiceCfg {
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
  /** Signs the user into an account (vs. linking one) — used to flag a fresh login. */
  isLogin?: boolean
}

export const SERVICES: Record<string, ServiceCfg> = {
  google: {
    name: 'Google',
    endpoint: '/auth/oauth/google/callback',
    loadingColor: '#4285F4',
    validateParams: (p) =>
      p.get('error')
        ? 'Google authorization was denied.'
        : !p.get('code') || !p.get('state')
          ? 'Google did not return the expected authorization details.'
          : null,
    buildBody: (p) => ({ code: p.get('code'), state: p.get('state') }),
    successNav: { to: '/settings/connections', replace: true },
    errorNav: { to: '/settings/connections', replace: true },
  },
  'google-drive': {
    name: 'Google Drive',
    endpoint: '/auth/oauth/google-drive/callback',
    loadingColor: '#4285F4',
    validateParams: (p) =>
      p.get('error')
        ? 'Google authorization was denied.'
        : !p.get('code') || !p.get('state')
          ? 'Google did not return the expected authorization details.'
          : null,
    buildBody: (p) => ({ code: p.get('code'), state: p.get('state') }),
    successNav: { to: '/settings/connections', replace: true },
    errorNav: { to: '/settings/connections', replace: true },
  },
  'plex-login': {
    name: 'Plex',
    endpoint: '/auth/plex/callback',
    loadingColor: '#BA5D2E',
    buildBody: (p) => ({ state: p.get('state'), pinId: p.get('pinId') || undefined }),
    onSuccess: (data) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken as string)
    },
    isLogin: true,
    successNav: { to: '/', replace: true },
    errorNav: { to: '/auth/login', replace: true },
  },
  'tmdb-login': {
    name: 'TMDb',
    endpoint: '/auth/tmdb/callback',
    loadingColor: '#01b4e4',
    validateParams: (p) => {
      if (p.get('tmdb_link') === 'error') return p.get('message') || 'Failed to sign in with TMDb.'
      if (p.get('approved') === 'false') return 'TMDb authorization was cancelled.'
      return null
    },
    buildBody: (p) => {
      if (p.get('tmdb_link') === 'success') return null
      const state = p.get('state')
      const requestToken = p.get('request_token')
      return state && requestToken ? { state, request_token: requestToken } : null
    },
    onSuccess: (data) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken as string)
    },
    isLogin: true,
    successNav: { to: '/', replace: true },
    errorNav: { to: '/auth/login', replace: true },
  },
  'google-login': {
    name: 'Google',
    endpoint: '/auth/google/callback',
    loadingColor: '#4285F4',
    validateParams: (p) =>
      p.get('error')
        ? 'Google authorization was denied.'
        : !p.get('code') || !p.get('state')
          ? 'Google did not return the expected authorization details.'
          : null,
    buildBody: (p) => ({ code: p.get('code'), state: p.get('state') }),
    onSuccess: (data) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken as string)
    },
    isLogin: true,
    successNav: { to: '/', replace: true },
    errorNav: { to: '/auth/login', replace: true },
  },
  plex: {
    name: 'Plex',
    endpoint: '/auth/oauth/plex/callback',
    buildBody: (p) => ({ state: p.get('state'), pinId: p.get('pinId') || undefined }),
    successNav: { to: '/settings/connections', replace: true },
    errorNav: { to: '/settings/connections', replace: true },
  },
  tmdb: {
    name: 'TMDb',
    endpoint: '/auth/oauth/tmdb/callback',
    loadingColor: '#01b4e4',
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
    successNav: { to: '/settings/connections', replace: true },
    errorNav: { to: '/settings/connections', replace: true },
  },
  steam: {
    name: 'Steam',
    endpoint: '/auth/steam/callback',
    useOpenId: true,
    loadingMsg: 'Verifying your Steam account...',
    successMsg: 'Signed in successfully.',
    buildBody: () => null,
    onSuccess: (data) => {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken as string)
    },
    isLogin: true,
    successNav: { to: '/', replace: true },
    errorNav: { to: '/auth/login', replace: true },
  },
  'steam-connect': {
    name: 'Steam',
    endpoint: '/auth/oauth/steam/callback',
    useOpenId: true,
    loadingMsg: 'Linking your Steam account...',
    successMsg: 'Your Steam account has been linked.',
    buildBody: () => null,
    onSuccess: () => {
      apiClient.post('/integrations/steam/scan').catch(() => {})
    },
    successNav: { to: '/library/steam', replace: true },
    errorNav: { to: '/settings/connections', replace: true },
  },
}

export const collectOpenId = (p: URLSearchParams) => {
  const params: Record<string, string> = {}
  for (const [key, value] of p.entries()) {
    if (key.startsWith('openid.') || key === 'state') params[key] = value
  }
  const rawQuery = window.location.search.replace(/^\?/, '')
  return { params, rawQuery }
}

export const handleCallback = async (cfg: ServiceCfg, params: URLSearchParams): Promise<void> => {
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
