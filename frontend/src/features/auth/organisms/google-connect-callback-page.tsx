import { useEffect, useRef, useState } from 'react'
import './google-connect-callback-page.scss'
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
  return 'Failed to link Google account. Please try again.'
}

export function GoogleConnectCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const search = new URLSearchParams(window.location.search)
    const code = search.get('code') ?? ''
    const state = search.get('state') ?? ''
    const linkError = search.get('error')

    ;(async () => {
      try {
        if (linkError) {
          throw new Error('Google authorization was denied.')
        }
        if (!code || !state) {
          throw new Error('Google did not return the expected authorization details. Please try linking again.')
        }
        await apiClient.post('/auth/oauth/google/callback', { code, state })
        setSuccess(true)
      } catch (err) {
        setError(extractMessage(err))
      }
    })()
  }, [navigate])

  return (
    <div className="dk-auth__wrapper">
      <Helmet>
        <title>Google Link - Otix</title>
      </Helmet>

      <div
        className="dk-auth__card"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {success ? (
          <>
            <div className="dk-auth__icon-wrapper dk-auth__icon-wrapper--success">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="dk-auth__title">Google Linked</h2>
            <p className="dk-auth__description">Your Google account has been linked successfully.</p>
            <p className="dk-auth__hint">Close this tab and return to Otix.</p>
            <div className="dk-auth__button-group">
              <button
                onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
                className="dk-auth__button dk-auth__button--secondary"
              >
                Go to Settings
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <div className="dk-auth__icon-wrapper dk-auth__icon-wrapper--error">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="dk-auth__title">Link Failed</h2>
            <p className="dk-auth__error-text">{error}</p>
            <button
              onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
              className="dk-auth__button dk-auth__button--primary"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <div className="dk-auth__icon-wrapper dk-auth__icon-wrapper--loading">
              <Loader2 className="h-7 w-7 text-[#4285F4] animate-spin" />
            </div>
            <h2 className="dk-auth__title">Linking Google Account</h2>
            <p className="dk-auth__description">Verifying with Google...</p>
          </>
        )}
      </div>
    </div>
  )
}
