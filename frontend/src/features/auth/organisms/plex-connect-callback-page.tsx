import { useEffect, useRef, useState } from 'react'
import './plex-connect-callback-page.scss'
import { useNavigate } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Failed to link Plex account. Please try again.'
}

export function PlexConnectCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const search = new URLSearchParams(window.location.search)
    const state = search.get('state') ?? ''
    const pinId = search.get('pinId') ?? undefined

    ;(async () => {
      try {
        await apiClient.post('/auth/oauth/plex/callback', { state, pinId })
        setSuccess(true)
      } catch (err) {
        setError(extractMessage(err))
      }
    })()
  }, [navigate])

  return (
    <div className="dk-auth-callback">
      <Helmet>
        <title>Plex Link - Otix</title>
      </Helmet>

      <div className="dk-auth-callback__card">
        {success ? (
          <>
            <div className="dk-auth-callback__icon dk-auth-callback__icon--success">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="dk-auth-callback__title">Plex Linked</h2>
            <p className="dk-auth-callback__text">Your Plex account has been linked successfully.</p>
            <p className="dk-auth-callback__hint">Close this tab and return to Otix to see your library.</p>
            <div className="dk-auth-callback__actions">
              <button
                onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
                className="dk-auth-callback__btn dk-auth-callback__btn--secondary"
              >
                Go to Settings
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <div className="dk-auth-callback__icon dk-auth-callback__icon--error">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="dk-auth-callback__title">Link Failed</h2>
            <p className="dk-auth-callback__text dk-auth-callback__text--error">{error}</p>
            <button
              onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
              className="dk-auth-callback__btn dk-auth-callback__btn--primary"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <div className="dk-auth-callback__icon dk-auth-callback__icon--loading">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            </div>
            <h2 className="dk-auth-callback__title">Linking Plex Account</h2>
            <p className="dk-auth-callback__text">Verifying with Plex...</p>
          </>
        )}
      </div>
    </div>
  )
}
