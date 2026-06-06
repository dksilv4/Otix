// TODO: Review this file
import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Check, Loader2, Mail, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../auth-provider'
import { AuthHeader } from '../molecules/auth-header'
import { Logo } from '@ui/atoms/logo'
import { cn } from '@/lib/utils'
import authBg1 from '@/assets/auth-bg-1.png'
import authBg2 from '@/assets/auth-bg-2.png'
import authBg3 from '@/assets/auth-bg-3.png'
import authBg4 from '@/assets/auth-bg-4.png'
import authBg5 from '@/assets/auth-bg-5.png'
import { apiClient } from '@/lib/api-client'
import './verify-email-page.scss'

const bgImages = [authBg1, authBg2, authBg3, authBg4, authBg5]

type PageState = 'verifying' | 'success' | 'error' | 'sending'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { token?: string; email?: string }
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<PageState>('verifying')
  const [errorMessage, setErrorMessage] = useState('')

  const bgImage = useMemo(() => bgImages[Math.floor(Math.random() * bgImages.length)], [])

  useEffect(() => {
    if (!search.token) {
      setState('error')
      setErrorMessage('No verification token provided.')
      return
    }
    verifyToken(search.token)
  }, [search.token])

  async function verifyToken(token: string) {
    setState('verifying')
    try {
      await apiClient.post('/auth/verify-email', { token })
      setState('success')
    } catch (err) {
      setState('error')
      setErrorMessage(extractMessage(err))
    }
  }

  async function handleResend() {
    setState('sending')
    try {
      await apiClient.post('/auth/verify-email/send')
      setErrorMessage('')
    } catch (err) {
      setErrorMessage(extractMessage(err))
    } finally {
      setState('error')
    }
  }

  function extractMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const resp = (err as { response?: { data?: { detail?: string } } }).response
      if (resp?.data?.detail) return resp.data.detail
    }
    if (err instanceof Error) return err.message
    return 'Something went wrong. Please try again.'
  }

  return (
    <div className="dk-auth-verify-wrapper">
      <div
        className="dk-auth-verify-bg-image"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="dk-auth-verify-bg-gradient" />

      <div className="dk-auth-verify-card">
        <Logo className="h-16" />

        <AuthHeader
          title="Email Verification"
          subtitle="Verify your email to unlock all features"
        />

        <div className="dk-auth-verify-content">
          {state === 'verifying' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="dk-auth-verify-status"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="dk-auth-verify-status__message">Verifying your email...</p>
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="dk-auth-verify-status"
            >
              <div className="dk-auth-verify-status__icon-wrapper dk-auth-verify-status__icon-wrapper--success">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="dk-auth-verify-status__title">Email Verified</p>
              <p className="dk-auth-verify-status__message text-center">
                Your email has been verified successfully.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: isAuthenticated ? '/' : '/auth/login' })}
                className={cn('dk-auth-verify-btn--primary', 'mt-2')}
              >
                {isAuthenticated ? 'Continue to Home' : 'Go to Sign In'}
              </button>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="dk-auth-verify-status"
            >
              <div className="dk-auth-verify-status__icon-wrapper dk-auth-verify-status__icon-wrapper--error">
                <ShieldAlert className="h-7 w-7 text-destructive" />
              </div>
              <p className="dk-auth-verify-status__title">Verification Failed</p>
              {errorMessage && (
                <p className="dk-auth-verify-status__message text-center">{errorMessage}</p>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleResend}
                  className={cn('dk-auth-verify-btn--ghost', 'mt-2')}
                >
                  <Mail className="h-4 w-4" />
                  Resend Verification Email
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className="dk-auth-verify-btn--primary"
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
