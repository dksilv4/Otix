import { useState, useMemo, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Mail, Loader2, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
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

type PageState = 'idle' | 'sending' | 'sent' | 'error'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<PageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const bgImage = useMemo(() => bgImages[Math.floor(Math.random() * bgImages.length)], [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setState('sending')
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() })
      setState('sent')
    } catch (err) {
      setState('error')
      setErrorMessage(extractMessage(err))
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
          title="Reset Password"
          subtitle={
            state === 'sent'
              ? 'Check your email for the reset link'
              : 'Enter your email and we\'ll send you a reset link'
          }
        />

        <div className="w-full space-y-4 mt-4">
          {state === 'sent' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-base font-semibold">Email Sent</p>
              <p className="text-sm text-muted-foreground text-center">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                The link expires in 2 hours. Check your spam folder if you don't see it.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className={cn(
                  'flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-all mt-2',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                )}
              >
                Return to Sign In
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full space-y-4">
              <div className="space-y-1.5">
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  autoFocus
                  className={cn(
                    'flex h-12 w-full rounded-xl bg-[var(--dk-surface-ghost-hover)] px-4 text-base transition-all',
                    'placeholder:text-muted-foreground/60',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-[var(--dk-surface-ghost-active)]',
                    'hover:bg-[var(--dk-surface-ghost-active)]',
                  )}
                />
              </div>

              {state === 'error' && errorMessage && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive"
                >
                  {errorMessage}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={state === 'sending' || !email.trim()}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider transition-all',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {state === 'sending' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
                <span>{state === 'sending' ? 'Sending…' : 'Send Reset Link'}</span>
              </button>
            </form>
          )}
        </div>

        <div className="mt-6">
          <Link
            to="/auth/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
