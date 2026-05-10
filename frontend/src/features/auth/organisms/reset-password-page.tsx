import { useState, useMemo, type FormEvent } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, Check, ShieldAlert, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthHeader } from '../molecules/auth-header'
import { PasswordField } from '../molecules/password-field'
import { PasswordStrengthBar } from '../atoms/password-strength-bar'
import { Logo } from '@ui/atoms/logo'
import { cn } from '@/lib/utils'
import authBg1 from '@/assets/auth-bg-1.png'
import authBg2 from '@/assets/auth-bg-2.png'
import authBg3 from '@/assets/auth-bg-3.png'
import authBg4 from '@/assets/auth-bg-4.png'
import authBg5 from '@/assets/auth-bg-5.png'
import { apiClient } from '@/lib/api-client'

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
            title="Invalid Link"
            subtitle="This password reset link is missing a valid token."
          />
          <div className="w-full mt-4">
            <Link
              to="/auth/forgot-password"
              className={cn(
                'flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-all',
                'bg-primary text-primary-foreground',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                'hover:bg-primary/90 active:scale-[0.98]',
              )}
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
          title="Set New Password"
          subtitle="Choose a strong new password for your account"
        />

        <div className="w-full space-y-4 mt-4">
          {state === 'success' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-base font-semibold">Password Reset</p>
              <p className="text-sm text-muted-foreground text-center">
                Your password has been reset successfully. You can now sign in with your new password.
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
                Go to Sign In
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full space-y-4">
              {state === 'error' && errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-destructive"
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
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider transition-all',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {state === 'submitting' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : null}
                <span>{state === 'submitting' ? 'Resetting…' : 'Reset Password'}</span>
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
