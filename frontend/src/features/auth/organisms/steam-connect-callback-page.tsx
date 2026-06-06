// TODO: Review this file
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Check, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'
import './steam-connect-callback-page.scss'

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Failed to link Steam account. Please try again.'
}

export function SteamConnectCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
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
        await apiClient.post('/auth/oauth/steam/callback', { params: openidParams, rawQuery })
        // Trigger initial library scan (non-blocking)
        apiClient.post('/integrations/steam/scan').catch(() => {})
        setSuccess(true)

        // Electron OAuth: redirect via otix:// to bring app to foreground
        const source = new URLSearchParams(window.location.search).get('source')
        if (source === 'desktop') {
          window.location.href = 'otix://auth/steam/connect/callback?success=true'
          return
        }

        setTimeout(() => {
          navigate({
            to: '/library/$tab',
            params: { tab: 'steam' },
            replace: true,
          })
        }, 1200)
      } catch (err) {
        const msg = extractMessage(err)
        setError(msg)
      }
    })()
  }, [navigate])

  return (
    <div className="dk-auth-steam-connect-callback">
      <Helmet>
        <title>Steam Link - Otix</title>
      </Helmet>

      <div
        className="dk-auth-steam-connect-callback__card"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {success ? (
          <>
            <div className="dk-auth-steam-connect-callback__icon dk-auth-steam-connect-callback__icon--success">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="dk-auth-steam-connect-callback__title">Steam Linked</h2>
            <p className="dk-auth-steam-connect-callback__text">Your Steam account has been linked. Redirecting...</p>
          </>
        ) : error ? (
          <>
            <div className="dk-auth-steam-connect-callback__icon dk-auth-steam-connect-callback__icon--error">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="dk-auth-steam-connect-callback__title">Link Failed</h2>
            <p className="dk-auth-steam-connect-callback__text dk-auth-steam-connect-callback__text--center">{error}</p>
            <button
              onClick={() => navigate({ to: '/settings', replace: true })}
              className="dk-auth-steam-connect-callback__btn dk-auth-steam-connect-callback__btn--primary"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <div className="dk-auth-steam-connect-callback__icon dk-auth-steam-connect-callback__icon--loading">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            </div>
            <h2 className="dk-auth-steam-connect-callback__title">Linking Steam Account</h2>
            <p className="dk-auth-steam-connect-callback__text">Verifying with Steam...</p>
          </>
        )}
      </div>
    </div>
  )
}
