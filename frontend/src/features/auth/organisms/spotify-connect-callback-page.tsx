// TODO: Review this file
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'
import './spotify-connect-callback-page.scss'

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Failed to link Spotify account. Please try again.'
}

export function SpotifyConnectCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    // Use the router's location (works in both browser and Electron file:// context)
    const search = new URLSearchParams(location.search)
    const code = search.get('code') ?? ''
    const state = search.get('state') ?? ''
    const linkError = search.get('error')

    ;(async () => {
      try {
        if (linkError) {
          throw new Error('Spotify authorization was denied.')
        }
        if (!code || !state) {
          throw new Error('Spotify did not return the expected authorization details. Please try linking again.')
        }
        await apiClient.post('/auth/oauth/spotify/callback', { code, state })
        setSuccess(true)
      } catch (err) {
        setError(extractMessage(err))
      }
    })()
  }, [navigate, location.search])

  return (
    <div className="dk-auth-spotify-connect-callback">
      <Helmet>
        <title>Spotify Link - Otix</title>
      </Helmet>

      <div className="dk-auth-spotify-connect-callback__card"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {success ? (
          <>
            <div className="dk-auth-spotify-connect-callback__icon-ring dk-auth-spotify-connect-callback__icon-ring--success">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="dk-auth-spotify-connect-callback__title">Spotify Linked</h2>
            <p className="dk-auth-spotify-connect-callback__description">Your Spotify account has been linked successfully.</p>
            <p className="dk-auth-spotify-connect-callback__note">Close this tab and return to Otix to see your music.</p>
            <div className="dk-auth-spotify-connect-callback__actions">
              <button
                onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
                className="dk-auth-spotify-connect-callback__button dk-auth-spotify-connect-callback__button--ghost"
              >
                Go to Settings
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <div className="dk-auth-spotify-connect-callback__icon-ring dk-auth-spotify-connect-callback__icon-ring--error">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="dk-auth-spotify-connect-callback__title">Link Failed</h2>
            <p className="dk-auth-spotify-connect-callback__description dk-auth-spotify-connect-callback__description--center">{error}</p>
            <button
              onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
              className="dk-auth-spotify-connect-callback__button dk-auth-spotify-connect-callback__button--primary"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <div className="dk-auth-spotify-connect-callback__icon-ring dk-auth-spotify-connect-callback__icon-ring--loading">
              <Loader2 className="h-7 w-7 text-[#1db954] animate-spin" />
            </div>
            <h2 className="dk-auth-spotify-connect-callback__title">Linking Spotify Account</h2>
            <p className="dk-auth-spotify-connect-callback__description">Verifying with Spotify...</p>
          </>
        )}
      </div>
    </div>
  )
}
