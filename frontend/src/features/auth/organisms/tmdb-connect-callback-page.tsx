// TODO: Review this file
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'
import './tmdb-connect-callback-page.scss'

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Failed to link TMDb account. Please try again.'
}

export function TmdbConnectCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const search = new URLSearchParams(window.location.search)
    const linkStatus = search.get('tmdb_link')
    const message = search.get('message')
    const state = search.get('state') ?? ''
    const requestToken = search.get('request_token') ?? ''
    const approved = search.get('approved')

    ;(async () => {
      try {
        if (linkStatus === 'success') {
          setSuccess(true)
          return
        }
        if (linkStatus === 'error') {
          throw new Error(message || 'Failed to link TMDb account. Please try again.')
        }
        if (approved === 'false') {
          throw new Error('TMDb authorization was cancelled.')
        }
        if (!state || !requestToken) {
          throw new Error('TMDb did not return the expected authorization details. Please try linking again.')
        }
        await apiClient.post('/auth/oauth/tmdb/callback', { state, request_token: requestToken })
        setSuccess(true)
      } catch (err) {
        setError(extractMessage(err))
      }
    })()
  }, [navigate])

  return (
    <div className="dk-auth-callback">
      <Helmet>
        <title>TMDb Link - Otix</title>
      </Helmet>

      <div className="dk-auth-callback__card">
        {success ? (
          <>
            <div className="dk-auth-callback__icon dk-auth-callback__icon--success">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="dk-auth-callback__title">TMDb Linked</h2>
            <p className="dk-auth-callback__text">Your TMDb account has been linked successfully.</p>
            <p className="dk-auth-callback__hint">Close this tab and return to Otix.</p>
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
            <p className="dk-auth-callback__text dk-auth-callback__text--center">{error}</p>
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
              <Loader2 className="h-7 w-7 text-[#01b4e4] animate-spin" />
            </div>
            <h2 className="dk-auth-callback__title">Linking TMDb Account</h2>
            <p className="dk-auth-callback__text">Verifying with TMDb...</p>
          </>
        )}
      </div>
    </div>
  )
}
