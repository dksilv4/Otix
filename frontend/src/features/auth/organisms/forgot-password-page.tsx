// TODO: Review this file
import { useState, useMemo, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Mail, Loader2, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthHeader } from '../molecules/auth-header'
import { Logo } from '@ui/atoms/logo'
import authBg1 from '@/assets/auth-bg-1.png'
import authBg2 from '@/assets/auth-bg-2.png'
import authBg3 from '@/assets/auth-bg-3.png'
import authBg4 from '@/assets/auth-bg-4.png'
import authBg5 from '@/assets/auth-bg-5.png'
import { apiClient } from '@/lib/api-client'
import './forgot-password-page.scss'

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
    <div className="dk-auth-forgot-wrapper">
      <div
        className="dk-auth-forgot-bg"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="dk-auth-forgot-overlay" />

      <div
        className="dk-auth-forgot-card"
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

        <div className="dk-auth-forgot-content">
          {state === 'sent' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="dk-auth-forgot-sent"
            >
              <div className="dk-auth-forgot-sent__icon-wrap">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="dk-auth-forgot-sent__title">Email Sent</p>
              <p className="dk-auth-forgot-sent__info">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
              </p>
              <p className="dk-auth-forgot-sent__note">
                The link expires in 2 hours. Check your spam folder if you don't see it.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className="dk-auth-forgot-sent__button"
              >
                Return to Sign In
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="dk-auth-forgot-form">
              <div className="dk-auth-forgot-form__field">
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
                  className="dk-auth-forgot-input"
                />
              </div>

              {state === 'error' && errorMessage && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="dk-auth-forgot-error"
                >
                  {errorMessage}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={state === 'sending' || !email.trim()}
                className="dk-auth-forgot-submit"
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

        <div className="dk-auth-forgot-back-wrap">
          <Link
            to="/auth/login"
            className="dk-auth-forgot-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
