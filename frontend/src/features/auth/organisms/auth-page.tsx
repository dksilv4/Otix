import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useRouter, useSearch, useLocation } from '@tanstack/react-router'
import { LogIn, UserPlus, Loader2, Check, Shield, ArrowLeft, ArrowRight } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../auth-provider'
import { AuthHeader } from '../molecules/auth-header'
import { PasswordField } from '../molecules/password-field'
import { PasswordStrengthBar } from '../atoms/password-strength-bar'
import { Logo } from '@ui/atoms/logo'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { cn } from '@/lib/utils'

type FormMode = 'login' | 'register'

interface LoginFields {
  identity: string
  password: string
}

interface RegisterFields {
  email: string
  username: string
  password: string
  confirmPassword: string
  dateOfBirth: string
}

interface FieldErrors {
  identity?: string
  email?: string
  username?: string
  password?: string
  confirmPassword?: string
  dateOfBirth?: string
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string; message?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
    if (resp?.data?.message) return resp.data.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

function validateLoginFields(fields: LoginFields): { errors: FieldErrors; valid: boolean } {
  const errors: FieldErrors = {}
  if (!fields.identity.trim()) errors.identity = 'Username or email is required'
  if (!fields.password) errors.password = 'Password is required'
  else if (fields.password.length < 8) errors.password = 'Password must be at least 8 characters'
  return { errors, valid: Object.keys(errors).length === 0 }
}

function validateRegisterFields(fields: RegisterFields): { errors: FieldErrors; valid: boolean } {
  const errors: FieldErrors = {}
  if (!fields.email.trim()) errors.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = 'Please enter a valid email address'
  if (!fields.username.trim()) errors.username = 'Username is required'
  else if (fields.username.trim().length < 3) errors.username = 'Username must be at least 3 characters'
  if (!fields.password) errors.password = 'Password is required'
  else if (fields.password.length < 8) errors.password = 'Password must be at least 8 characters'
  else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(fields.password))
    errors.password = 'Password must contain uppercase, lowercase, and a number'
  if (!fields.confirmPassword) errors.confirmPassword = 'Please confirm your password'
  else if (fields.password !== fields.confirmPassword) errors.confirmPassword = 'Passwords do not match'
  if (!fields.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
  else {
    const dob = new Date(fields.dateOfBirth)
    if (isNaN(dob.getTime())) errors.dateOfBirth = 'Please enter a valid date'
    else {
      const today = new Date()
      let age = today.getFullYear() - dob.getFullYear()
      const m = today.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
      if (age < 13) errors.dateOfBirth = 'You must be at least 13 years old'
      else if (age > 120) errors.dateOfBirth = 'Please enter a valid date'
    }
  }
  return { errors, valid: Object.keys(errors).length === 0 }
}

const inputClasses = cn(
  'flex min-h-[52px] w-full rounded-xl px-5 text-base transition-all duration-200',
  'bg-[var(--dk-surface-glass)]',
  'placeholder:text-white/30',
  'focus:outline-none focus:ring-1 focus:ring-white/25 focus:bg-[var(--dk-surface-glass-hover)]',
  'hover:bg-[var(--dk-surface-glass-hover)]',
  'shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]',
)

const tabSpring = { type: 'spring' as const, stiffness: 500, damping: 30 }

export function AuthPage() {
  const { login, register, isAuthenticated, isLoading, twoFactorChallenge, verifyTwoFactor, cancelTwoFactor } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const search = useSearch({ strict: false }) as { redirect?: string }

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate({ to: search.redirect || '/', replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, search.redirect])

  const [mode, setMode] = useState<FormMode>(
    location.pathname === '/auth/register' ? 'register' : 'login',
  )

  // Login state
  const [identity, setIdentity] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register state
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [totpSubmitting, setTotpSubmitting] = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)

  const switchMode = useCallback(
    (nextMode: FormMode) => {
      if (isSubmitting || nextMode === mode) return
      setMode(nextMode)
      setFieldErrors({})
      setAuthError('')
      setShowSuccess(false)
      navigate({
        to: nextMode === 'login' ? '/auth/login' : '/auth/register',
        replace: true,
      })
      setTimeout(() => firstInputRef.current?.focus(), 100)
    },
    [isSubmitting, mode, navigate],
  )

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    setFieldErrors({})

    const { errors, valid } = validateLoginFields({ identity, password: loginPassword })
    if (!valid) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      await login(identity, loginPassword)
      setShowSuccess(true)
      setTimeout(() => {
        navigate({ to: search.redirect || '/' })
      }, 600)
    } catch (err) {
      setAuthError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    setFieldErrors({})

    const { errors, valid } = validateRegisterFields({
      email,
      username,
      password: regPassword,
      confirmPassword,
      dateOfBirth,
    })
    if (!valid) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      await register(email, username, regPassword, dateOfBirth)
      setShowSuccess(true)
      setTimeout(() => {
        navigate({ to: search.redirect || '/' })
      }, 600)
    } catch (err) {
      setAuthError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyTwoFactor(e: FormEvent) {
    e.preventDefault()
    if (totpCode.length !== 6) return
    setTotpError('')
    setTotpSubmitting(true)
    try {
      await verifyTwoFactor(totpCode)
      setShowSuccess(true)
      setTimeout(() => {
        navigate({ to: search.redirect || '/' })
      }, 600)
    } catch (err) {
      setTotpError(extractErrorMessage(err))
    } finally {
      setTotpSubmitting(false)
    }
  }

  const [steamLoading, setSteamLoading] = useState(false)

  async function handleSteamLogin() {
    setSteamLoading(true)
    try {
      const { data } = await apiClient.post('/auth/steam/initiate')
      window.location.href = data.authUrl
    } catch {
      setSteamLoading(false)
    }
  }

  const isLogin = mode === 'login'
  const router = useRouter()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 auth-aurora-bg">
      {canGoBack && (
        <div className="fixed top-4 left-4 z-[9999] flex items-center rounded-[2rem] bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-lg shadow-[var(--dk-shadow-glass)] px-2 py-1.5">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="w-8 h-8 rounded-full p-0 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <div
        className={cn(
          'relative z-10 w-full max-w-[440px] flex flex-col items-center',
          'px-8 py-10 sm:px-10 sm:py-12 rounded-[2rem]',
          'bg-[var(--dk-surface-glass)] backdrop-blur-2xl',
          'shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]',
        )}
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <div className="mb-2">
          <Logo className="h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
        </div>

        <AuthHeader
          title={isLogin ? 'Welcome back' : 'Join Otix'}
          subtitle={
            isLogin
              ? 'Sign in to continue your journey'
              : 'Create an account to get started'
          }
        />

        {/* 2FA Challenge */}
        {twoFactorChallenge && (
          <form onSubmit={handleVerifyTwoFactor} className="w-full space-y-4">
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--dk-surface-glass)]">
                <Shield className="h-7 w-7 text-white/50" />
              </div>
            </div>
            <p className="text-center text-sm text-white/40">
              Enter the 6-digit code from your authenticator app.
            </p>

            {totpError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-300 text-center"
              >
                {totpError}
              </motion.div>
            )}

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-full rounded-xl bg-[var(--dk-surface-glass)] px-4 py-5 text-center text-2xl font-mono tracking-[0.3em] placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/25 focus:bg-[var(--dk-surface-glass-hover)] transition-all duration-200 shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]"
            />

            <div className="flex justify-center pt-2">
              <button
                type="submit"
                disabled={totpCode.length !== 6 || totpSubmitting || showSuccess}
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300',
                  'bg-white text-black',
                  'shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                  'hover:bg-[#e8e0ff] hover:shadow-[0_4px_28px_rgba(96,165,250,0.35)] hover:scale-105',
                  'active:scale-95',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                  showSuccess && '!bg-green-400 !shadow-[0_0_24px_rgba(34,197,94,0.5)]',
                )}
                aria-label="Verify code"
              >
                {showSuccess ? (
                  <Check className="h-6 w-6 text-black" />
                ) : totpSubmitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <ArrowRight className="h-6 w-6" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                cancelTwoFactor()
                setTotpCode('')
                setTotpError('')
              }}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-white/30 hover:text-white/70 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          </form>
        )}

        {/* Tabs — hidden during 2FA challenge */}
        {!twoFactorChallenge && (
        <>
        <div className="relative flex mb-8 p-1 rounded-2xl bg-[var(--dk-surface-glass-hover)] w-full">
          <motion.div
            className="absolute top-1 bottom-1 rounded-xl bg-white/[0.10] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
            initial={false}
            animate={{ left: isLogin ? '0.25rem' : '50%', width: 'calc(50% - 0.25rem)' }}
            transition={tabSpring}
          />
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200',
              isLogin ? 'text-white/90' : 'text-white/35 hover:text-white/70',
            )}
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200',
              !isLogin ? 'text-white/90' : 'text-white/35 hover:text-white/70',
            )}
          >
            <UserPlus className="h-4 w-4" />
            Create Account
          </button>
        </div>

        {/* Auth-level error */}
        <AnimatePresence>
          {authError && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full mb-5 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-300"
            >
              {authError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forms */}
        <AnimatePresence mode="wait">
          {isLogin ? (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleLogin}
              className="w-full space-y-4"
            >
              <div className="space-y-1.5">
                <input
                  ref={firstInputRef}
                  id="identity"
                  name="identity"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="Username or email"
                  autoComplete="username"
                  required
                  aria-invalid={!!fieldErrors.identity}
                  aria-describedby={fieldErrors.identity ? 'identity-error' : undefined}
                  className={cn(inputClasses, fieldErrors.identity && '!ring-1 !ring-red-400/50 !focus:ring-red-400/50')}
                />
                {fieldErrors.identity && (
                  <p id="identity-error" role="alert" className="text-xs text-red-300">
                    {fieldErrors.identity}
                  </p>
                )}
              </div>

              <PasswordField
                id="login-password"
                name="password"
                label=""
                value={loginPassword}
                onChange={setLoginPassword}
                placeholder="Enter your password"
                autoComplete="current-password"
                error={fieldErrors.password}
              />

              <div className="flex justify-end">
                <Link
                  to="/auth/forgot-password"
                  className="text-xs text-white/30 hover:text-white/70 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || showSuccess}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300',
                    'bg-white text-black',
                    'shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                    'hover:bg-[#e8e0ff] hover:shadow-[0_4px_28px_rgba(96,165,250,0.35)] hover:scale-105',
                    'active:scale-95',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                    showSuccess && '!bg-green-400 !shadow-[0_0_24px_rgba(34,197,94,0.5)]',
                  )}
                  aria-label={isLogin ? 'Sign in' : 'Create account'}
                >
                  {showSuccess ? (
                    <Check className="h-6 w-6 text-black" />
                  ) : isSubmitting ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <ArrowRight className="h-6 w-6" />
                  )}
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleRegister}
              className="w-full space-y-4"
            >
              <div className="space-y-1.5">
                <input
                  ref={firstInputRef}
                  id="reg-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  autoComplete="email"
                  required
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  className={cn(inputClasses, fieldErrors.email && '!ring-1 !ring-red-400/50 !focus:ring-red-400/50')}
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="text-xs text-red-300">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <input
                  id="reg-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="Username"
                  autoComplete="username"
                  required
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                  className={cn(inputClasses, fieldErrors.username && '!ring-1 !ring-red-400/50 !focus:ring-red-400/50')}
                />
                {fieldErrors.username && (
                  <p id="username-error" role="alert" className="text-xs text-red-300">
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <input
                  id="reg-dob"
                  name="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  required
                  aria-invalid={!!fieldErrors.dateOfBirth}
                  aria-describedby={fieldErrors.dateOfBirth ? 'dob-error' : undefined}
                  className={cn(inputClasses, fieldErrors.dateOfBirth && '!ring-1 !ring-red-400/50 !focus:ring-red-400/50')}
                />
                {fieldErrors.dateOfBirth && (
                  <p id="dob-error" role="alert" className="text-xs text-red-300">
                    {fieldErrors.dateOfBirth}
                  </p>
                )}
              </div>

              <PasswordField
                id="reg-password"
                name="password"
                label=""
                value={regPassword}
                onChange={setRegPassword}
                placeholder="Create a password"
                autoComplete="new-password"
                error={fieldErrors.password}
              />
              <PasswordStrengthBar password={regPassword} />

              <PasswordField
                id="reg-confirm"
                name="confirmPassword"
                label=""
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm your password"
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
              />

              <div className="flex justify-center pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || showSuccess}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300',
                    'bg-white text-black',
                    'shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                    'hover:bg-[#e8e0ff] hover:shadow-[0_4px_28px_rgba(96,165,250,0.35)] hover:scale-105',
                    'active:scale-95',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-[0_4px_20px_rgba(139,92,246,0.25)]',
                    showSuccess && '!bg-green-400 !shadow-[0_0_24px_rgba(34,197,94,0.5)]',
                  )}
                  aria-label="Create account"
                >
                  {showSuccess ? (
                    <Check className="h-6 w-6 text-black" />
                  ) : isSubmitting ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <ArrowRight className="h-6 w-6" />
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 pt-5 border-t border-white/[0.08] w-full">
          <p className="text-center text-xs text-white/20 mb-4 tracking-wider uppercase">or continue with</p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSteamLogin}
              disabled={steamLoading || isSubmitting}
              className="relative flex h-14 w-14 items-center justify-center rounded-full overflow-hidden text-white/80 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 group"
              aria-label="Continue with Steam"
              style={{ background: 'linear-gradient(135deg, #1b2838 0%, #1d3f5f 100%)' }}
            >
              <div className="absolute inset-0 bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity" />
              {steamLoading ? (
                <Loader2 className="h-5 w-5 animate-spin relative z-10" />
              ) : (
                <SteamIcon className="h-5 w-5 relative z-10" />
              )}
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
