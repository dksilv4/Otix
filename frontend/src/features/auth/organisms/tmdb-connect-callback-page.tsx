import { useEffect, useRef, useState } from 'react'
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
          setTimeout(() => {
            navigate({
              to: '/settings',
              search: { section: 'integrations' } as never,
              replace: true,
            })
          }, 1200)
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
        await apiClient.post('/auth/integrations/tmdb/callback', { state, request_token: requestToken })
        setSuccess(true)
        setTimeout(() => {
          navigate({
            to: '/settings',
            search: { section: 'integrations' } as never,
            replace: true,
          })
        }, 1200)
      } catch (err) {
        setError(extractMessage(err))
      }
    })()
  }, [navigate])

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <Helmet>
        <title>TMDb Link - Otix</title>
      </Helmet>

      <div
        className="relative z-10 w-full max-w-[440px] flex flex-col items-center px-8 py-10 sm:px-10 sm:py-12 rounded-[2rem] bg-[var(--dk-surface-overlay)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)]"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        {success ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 mb-4">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold">TMDb Linked</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your TMDb account has been linked. Redirecting...</p>
          </>
        ) : error ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 mb-4">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold">Link Failed</h2>
            <p className="mt-2 text-sm text-muted-foreground text-center">{error}</p>
            <button
              onClick={() => navigate({ to: '/settings', search: { section: 'integrations' } as never, replace: true })}
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#01b4e4]/10 mb-4">
              <Loader2 className="h-7 w-7 text-[#01b4e4] animate-spin" />
            </div>
            <h2 className="text-lg font-semibold">Linking TMDb Account</h2>
            <p className="mt-2 text-sm text-muted-foreground">Verifying with TMDb...</p>
          </>
        )}
      </div>
    </div>
  )
}
