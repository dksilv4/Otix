// TODO: Review this file
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../auth-provider'
import { apiClient } from '@/lib/api-client'
import './steam-callback-page.scss'

const ACCESS_TOKEN_KEY = 'otix-access-token'

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Failed to sign in with Steam. Please try again.'
}

export function SteamCallbackPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [error, setError] = useState('')
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const search = new URLSearchParams(window.location.search)
    const openidParams: Record<string, string> = {}
    for (const [key, value] of search.entries()) {
      if (key.startsWith('openid.') || key === 'state') {
        openidParams[key] = value
      }
    }
    const rawQuery = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : window.location.search

    ;(async () => {
      try {
        const { data } = await apiClient.post('/auth/steam/callback', { params: openidParams, rawQuery })
        localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken)

        // Electron OAuth: redirect via otix:// protocol to bring app to foreground
        const source = new URLSearchParams(window.location.search).get('source')
        if (source === 'desktop') {
          window.location.href = `otix://auth/steam/callback?accessToken=${encodeURIComponent(data.accessToken)}`
          return
        }

        navigate({ to: '/', replace: true })
      } catch (err) {
        const msg = extractMessage(err)
        setError(msg)
      }
    })()
  }, [navigate])

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: '/', replace: true })
    }
  }, [isAuthenticated, navigate])

  return (
    <div className="dk-auth-steam-callback">
      <Helmet>
        <title>Steam Sign In - Otix</title>
      </Helmet>

      <div
        className="dk-auth-steam-callback__card"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {error ? (
          <>
            <div className="dk-auth-steam-callback__icon dk-auth-steam-callback__icon--error">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="dk-auth-steam-callback__title">Sign In Failed</h2>
            <p className="dk-auth-steam-callback__text dk-auth-steam-callback__text--error">{error}</p>
            <button
              onClick={() => navigate({ to: '/auth/login', replace: true })}
              className="dk-auth-steam-callback__btn"
            >
              Back to Sign In
            </button>
          </>
        ) : (
          <>
            <div className="dk-auth-steam-callback__icon dk-auth-steam-callback__icon--loading">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            </div>
            <h2 className="dk-auth-steam-callback__title">Signing In with Steam</h2>
            <p className="dk-auth-steam-callback__text">
              Verifying your Steam account...
            </p>
          </>
        )}
      </div>
    </div>
  )
}
