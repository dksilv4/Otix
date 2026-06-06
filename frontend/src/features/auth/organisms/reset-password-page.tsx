// TODO: Review this file
import { useState, useMemo, type FormEvent } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, Check, ShieldAlert, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthHeader } from '../molecules/auth-header'
import { PasswordField } from '../molecules/password-field'
import { PasswordStrengthBar } from '../atoms/password-strength-bar'
import { Logo } from '@ui/atoms/logo'
import authBg1 from '@/assets/auth-bg-1.png'
import authBg2 from '@/assets/auth-bg-2.png'
import authBg3 from '@/assets/auth-bg-3.png'
import authBg4 from '@/assets/auth-bg-4.png'
import authBg5 from '@/assets/auth-bg-5.png'
import { apiClient } from '@/lib/api-client'
import './reset-password-page.scss'

const bgImages = [authBg1, authBg2, authBg3, authBg4, authBg5]

type PageState = 'idle' | 'submitting' | 'success' | 'error'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { token?: string }
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [state, setState] = useState<PageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})

  const bgImage = useMemo(() => bgImages[Math.floor(Math.random() * bgImages.length)], [])

  if (!search.token) {
    return (
      <div className="dk-auth-reset__page">
        <div
          className="dk-auth-reset__bg-image"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
        <div className="dk-auth-reset__bg-gradient" />

        <div className="dk-auth-reset__card">
          <Logo className="h-16" />
          <AuthHeader
            title="Invalid Link"
            subtitle="This password reset link is missing a valid token."
          />
          <div className="dk-auth-reset__form-wrapper">
            <Link
              to="/auth/forgot-password"
              className="dk-auth-reset__button--primary"
            >
              Request a New Link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  function validate(): boolean {
    const errors: { password?: string; confirm?: string } = {}
    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password))
      errors.password = 'Password must contain uppercase, lowercase, and a number'
    if (!confirmPassword) errors.confirm = 'Please confirm your password'
    else if (password !== confirmPassword) errors.confirm = 'Passwords do not match'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    if (!validate()) return

    setState('submitting')
    try {
      await apiClient.post('/auth/reset-password', {
        token: search.token,
        password,
      })
      setState('success')
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
    <div className="dk-auth-reset__page">
      <div
        className="dk-auth-reset__bg-image"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="dk-auth-reset__bg-gradient" />

      <div className="dk-auth-reset__card">
        <Logo className="h-16" />

        <AuthHeader
          title="Set New Password"
          subtitle="Choose a strong new password for your account"
        />

        <div className="dk-auth-reset__form-wrapper">
          {state === 'success' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="dk-auth-reset__success"
            >
              <div className="dk-auth-reset__success-icon">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="dk-auth-reset__success-title">Password Reset</p>
              <p className="dk-auth-reset__success-description">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: '/auth/login' })}
                className="dk-auth-reset__button--primary mt-2"
              >
                Go to Sign In
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="dk-auth-reset__form">
              {state === 'error' && errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="dk-auth-reset__error-banner"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {errorMessage}
                </motion.div>
              )}

              <PasswordField
                id="reset-password"
                name="password"
                label=""
                value={password}
                onChange={setPassword}
                placeholder="New password"
                autoComplete="new-password"
                error={fieldErrors.password}
              />
              <PasswordStrengthBar password={password} />

              <PasswordField
                id="reset-confirm"
                name="confirmPassword"
                label=""
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm new password"
                autoComplete="new-password"
                error={fieldErrors.confirm}
              />

              <button
                type="submit"
                disabled={state === 'submitting'}
                className="dk-auth-reset__button--submit"
              >
                {state === 'submitting' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : null}
                <span>{state === 'submitting' ? 'Resetting…' : 'Reset Password'}</span>
              </button>
            </form>
          )}
        </div>

        <div className="dk-auth-reset__back-link">
          <Link
            to="/auth/login"
            className="dk-auth-reset__back-link-anchor"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
