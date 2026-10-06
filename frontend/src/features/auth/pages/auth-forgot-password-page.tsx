import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Mail, Loader2, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { Logo } from '@ui/atoms/logo'
import { apiClient } from '@/lib/api/client'
import { extractErrorMessage } from '@auth/utils'
import type { ForgotPasswordPageState } from '@auth/types'

export const ForgotPasswordPage = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<ForgotPasswordPageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() })
      setState('sent')
    } catch (err) {
      setState('error')
      setErrorMessage(extractErrorMessage(err))
    }
  }

  return (
    <div id="auth-forgot-password-page" className="relative flex min-h-screen items-center justify-center p-4">
      <AuthBackground />
      <AuthCard>
        <div className="mb-6 flex justify-center">
          <Logo className="h-16" />
        </div>

        <AuthHeader
          title="Reset Password"
          subtitle={
            state === 'sent'
              ? 'Check your email for the reset link'
              : "Enter your email and we'll send you a reset link"
          }
        />

        {state === 'sent' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <p className="text-sm font-medium">Email Sent</p>
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong className="text-foreground">{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-muted-foreground/60">
              The link expires in 2 hours. Check your spam folder if you don't see it.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: '/auth/login' })}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium backdrop-blur-lg transition-colors hover:bg-white/20"
            >
              Return to Sign In
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
                className="flex min-h-[52px] w-full rounded-xl px-5 text-base outline-none transition-all placeholder:text-muted-foreground/50"
                style={{
                  backgroundColor: 'var(--dk-surface-glass)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.06)',
                }}
              />
            </div>

            {state === 'error' && errorMessage && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl px-4 py-2 text-sm text-destructive"
                style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}
              >
                {errorMessage}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={state === 'sending' || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-medium backdrop-blur-lg transition-colors hover:bg-white/20 disabled:opacity-50"
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

        <div className="mt-6">
          <Link
            to="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white/80"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    </div>
  )
};
