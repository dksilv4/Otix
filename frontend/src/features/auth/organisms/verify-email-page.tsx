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
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background/70" />

      <div
        className={cn(
          'relative z-10 w-full max-w-[440px] flex flex-col items-center',
          'px-8 py-10 sm:px-10 sm:py-12 rounded-[2rem]',
          'bg-[var(--dk-surface-overlay)] backdrop-blur-xl',
          'shadow-[var(--dk-shadow-glass)]',
        )}
      >
        <Logo className="h-16" />

        <AuthHeader
          title="Email Verification"
          subtitle="Verify your email to unlock all features"
        />

        <div className="w-full space-y-4 mt-4">
          {state === 'verifying' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying your email...</p>
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-base font-semibold">Email Verified</p>
              <p className="text-sm text-muted-foreground text-center">
                Your email has been verified successfully.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: isAuthenticated ? '/' : '/auth/login' })}
                className={cn(
                  'flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-all mt-2',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                )}
              >
                {isAuthenticated ? 'Continue to Home' : 'Go to Sign In'}
              </button>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-base font-semibold">Verification Failed</p>
              {errorMessage && (
                <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
              )}
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleResend}
                  className={cn(
                    'flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all mt-2',
                    'border border-white/10 bg-[var(--dk-surface-ghost-hover)]',
                    'hover:bg-[var(--dk-surface-ghost-active)] active:scale-[0.98]',
                  )}
                >
                  <Mail className="h-4 w-4" />
                  Resend Verification Email
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className={cn(
                  'flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-all',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                )}
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
