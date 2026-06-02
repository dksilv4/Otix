import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { Check, Loader2, XCircle } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { apiClient } from '@/lib/api-client'

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
        await apiClient.post('/auth/integrations/spotify/callback', { code, state })
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
  }, [navigate, location.search])

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <Helmet>
        <title>Spotify Link - Otix</title>
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
            <h2 className="text-lg font-semibold">Spotify Linked</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your Spotify account has been linked. Redirecting...</p>
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
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1db954]/10 mb-4">
              <Loader2 className="h-7 w-7 text-[#1db954] animate-spin" />
            </div>
            <h2 className="text-lg font-semibold">Linking Spotify Account</h2>
            <p className="mt-2 text-sm text-muted-foreground">Verifying with Spotify...</p>
          </>
        )}
      </div>
    </div>
  )
}
