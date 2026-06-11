import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Check, Loader2, Mail, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/features/auth'
import { AuthHeader } from '@/features/auth'
import { Logo } from '@ui/atoms/logo'
import { apiClient } from '@/lib/api-client'
import { extractErrorMessage } from '../utils'
import type { VerifyEmailPageState } from '../types'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { token?: string; email?: string }
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<VerifyEmailPageState>('verifying')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!search.token) return

    let cancelled = false

    apiClient.post('/auth/verify-email', { token: search.token })
      .then(() => { if (!cancelled) setState('success') })
      .catch((err) => { if (!cancelled) { setState('error'); setErrorMessage(extractErrorMessage(err)) } })

    return () => { cancelled = true }
  }, [search.token])

  async function handleResend() {
    setState('sending')
    try {
      await apiClient.post('/auth/verify-email/send')
      setErrorMessage('')
    } catch (err) {
      setErrorMessage(extractErrorMessage(err))
    } finally {
      setState('error')
    }
  }

  if (!search.token) {
    return (
      <div id="verify-email-page" className="flex min-h-screen items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-[2rem] p-8 text-center"
          style={{
            backgroundColor: 'var(--dk-surface-base)',
            animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="mb-6 flex justify-center">
            <Logo className="h-16" />
          </div>
          <AuthHeader title="Invalid Link" subtitle="No verification token provided." />
          <button
            type="button"
            onClick={() => navigate({ to: '/auth/login' })}
            className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium transition-colors hover:bg-white/20"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div id="verify-email-page" className="flex min-h-screen items-center justify-center p-4">
      <div
        className="w-full max-w-sm rounded-[2rem] p-8 text-center"
        style={{
          backgroundColor: 'var(--dk-surface-base)',
          animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="mb-6 flex justify-center">
          <Logo className="h-16" />
        </div>

        <AuthHeader
          title="Email Verification"
          subtitle="Verify your email to unlock all features"
        />

        <div className="space-y-4">
          {state === 'verifying' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Verifying your email...</p>
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm font-medium">Email Verified</p>
              <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                Your email has been verified successfully.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: isAuthenticated ? '/' : '/auth/login' })}
                className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium transition-colors hover:bg-white/20"
              >
                {isAuthenticated ? 'Continue to Home' : 'Go to Sign In'}
              </button>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
                <ShieldAlert className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-sm font-medium">Verification Failed</p>
              {errorMessage && (
                <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>{errorMessage}</p>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleResend}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors hover:bg-white/10"
                  style={{ color: 'rgba(255, 255, 255, 0.5)' }}
                >
                  <Mail className="h-4 w-4" />
                  Resend Verification Email
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium transition-colors hover:bg-white/20"
              >
                Go to Sign In
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
