import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, Check, ShieldAlert, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { PasswordField } from '@auth/components/molecules/auth-password-field'
import { PasswordStrengthBar } from '@auth/components/atoms/auth-password-strength-bar'
import { Logo } from '@/old-features/dk-ui/atoms/logo'
import { apiClient } from '@/lib/api-client'
import { extractErrorMessage } from '@auth/utils'
import type { ResetPasswordPageState } from '@auth/types'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { token?: string }
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [state, setState] = useState<ResetPasswordPageState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})

  if (!search.token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <AuthBackground />
        <AuthCard>
          <div className="mb-6 flex justify-center">
            <Logo className="h-16" />
          </div>
          <AuthHeader title="Invalid Link" subtitle="This password reset link is missing a valid token." />
          <Link
            to="/auth/forgot-password"
            className="inline-block rounded-full bg-white/10 px-5 py-2 text-sm font-medium transition-colors hover:bg-white/20"
          >
            Request a New Link
          </Link>
        </AuthCard>
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
      await apiClient.post('/auth/reset-password', { token: search.token, password })
      setState('success')
    } catch (err) {
      setState('error')
      setErrorMessage(extractErrorMessage(err))
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <AuthBackground />
      <AuthCard>
        <div className="mb-6 flex justify-center">
          <Logo className="h-16" />
        </div>

        <AuthHeader
          title="Set New Password"
          subtitle="Choose a strong new password for your account"
        />

        {state === 'success' ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <p className="text-sm font-medium">Password Reset</p>
            <p className="text-sm text-muted-foreground">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: '/auth/login' })}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium backdrop-blur-lg transition-colors hover:bg-white/20"
            >
              Go to Sign In
            </button>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {state === 'error' && errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-destructive"
                style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-medium backdrop-blur-lg transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              {state === 'submitting' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : null}
              <span>{state === 'submitting' ? 'Resetting…' : 'Reset Password'}</span>
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
}
