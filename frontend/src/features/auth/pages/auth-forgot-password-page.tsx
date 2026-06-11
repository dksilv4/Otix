import { useState, useMemo, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Mail, Loader2, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthHeader } from '../molecules/auth-header'
import { Logo } from '@ui/atoms/logo'
import { apiClient } from '@/lib/api-client'
import { extractErrorMessage } from '../utils'
import type { ForgotPasswordPageState } from '../types'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<ForgotPasswordPageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
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
    <div id="forgot-password-page" className="flex min-h-screen items-center justify-center p-4">
      <div
        id="forgot-password-card"
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
            <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>
              The link expires in 2 hours. Check your spam folder if you don't see it.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: '/auth/login' })}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium transition-colors hover:bg-white/20"
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
                className="flex min-h-[52px] w-full rounded-xl px-5 text-base outline-none transition-all placeholder:text-white/30"
                style={{ boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.2)' }}
              />
            </div>

            {state === 'error' && errorMessage && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl px-4 py-2 text-sm"
                style={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', color: 'rgb(252 165 165)' }}
              >
                {errorMessage}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={state === 'sending' || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
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
            className="inline-flex items-center gap-1.5 text-xs transition-colors hover:text-white/80"
            style={{ color: 'rgba(255, 255, 255, 0.4)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
