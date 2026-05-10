import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearch, useLocation } from '@tanstack/react-router'
import { LogIn, UserPlus, Loader2, Check, Shield, ArrowLeft } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../auth-provider'
import { AuthHeader } from '../molecules/auth-header'
import { PasswordField } from '../molecules/password-field'
import { PasswordStrengthBar } from '../atoms/password-strength-bar'
import { useMemo } from 'react'
import { Logo } from '@ui/atoms/logo'
import authBg1 from '@/assets/auth-bg-1.png'
import authBg2 from '@/assets/auth-bg-2.png'
import authBg3 from '@/assets/auth-bg-3.png'
import authBg4 from '@/assets/auth-bg-4.png'
import authBg5 from '@/assets/auth-bg-5.png'
import { cn } from '@/lib/utils'

const bgImages = [authBg1, authBg2, authBg3, authBg4, authBg5]

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
}

interface FieldErrors {
  identity?: string
  email?: string
  username?: string
  password?: string
  confirmPassword?: string
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
  return { errors, valid: Object.keys(errors).length === 0 }
}

const inputClasses = cn(
  'flex h-12 w-full rounded-xl bg-[var(--dk-surface-ghost-hover)] px-4 text-base transition-all',
  'placeholder:text-muted-foreground/60',
  'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-[var(--dk-surface-ghost-active)]',
  'focus:shadow-[var(--dk-shadow-lg)]',
  'hover:bg-[var(--dk-surface-ghost-active)]',
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
    })
    if (!valid) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      await register(email, username, regPassword)
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

  const bgImage = useMemo(() => bgImages[Math.floor(Math.random() * bgImages.length)], [])

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      {/* Random background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      {/* Subtle gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background/70" />

      <div
        className={cn(
          'relative z-10 w-full max-w-[440px] flex flex-col items-center',
          'px-8 py-10 sm:px-10 sm:py-12 rounded-[2rem]',
          'bg-[var(--dk-surface-overlay)] backdrop-blur-xl',
          'shadow-[var(--dk-shadow-glass)]',
        )}
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Logo className="h-16" />

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
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-7 w-7 text-primary" />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app.
            </p>

            {totpError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-destructive text-center"
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
              className="w-full rounded-2xl bg-[var(--dk-surface-ghost-hover)] px-4 py-5 text-center text-2xl font-mono tracking-[0.3em] placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-[var(--dk-surface-ghost-active)] transition-all"
            />

            <button
              type="submit"
              disabled={totpCode.length !== 6 || totpSubmitting || showSuccess}
              className={cn(
                'flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider transition-all',
                'bg-primary text-primary-foreground',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                'hover:bg-primary/90 active:scale-[0.98]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                showSuccess && '!bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]',
              )}
            >
              {showSuccess ? (
                <Check className="h-5 w-5" />
              ) : totpSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Shield className="h-5 w-5" />
              )}
              <span>
                {showSuccess ? 'Verified' : totpSubmitting ? 'Verifying…' : 'Verify'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                cancelTwoFactor()
                setTotpCode('')
                setTotpError('')
              }}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          </form>
        )}

        {/* Tabs — hidden during 2FA challenge */}
        {!twoFactorChallenge && (
        <>
        <div className="relative flex mb-8 p-1 rounded-2xl bg-[var(--dk-surface-ghost-active)] w-full">
          <motion.div
            className="absolute top-1 bottom-1 rounded-xl bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-sm)]"
            initial={false}
            animate={{ left: isLogin ? '0.25rem' : '50%', width: 'calc(50% - 0.25rem)' }}
            transition={tabSpring}
          />
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn(
              'relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200',
              isLogin ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
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
              !isLogin ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
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
              className="w-full mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-destructive"
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
                  className={cn(inputClasses, fieldErrors.identity && 'ring-2 ring-destructive/50')}
                />
                {fieldErrors.identity && (
                  <p id="identity-error" role="alert" className="text-xs text-destructive">
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
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || showSuccess}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider transition-all',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary',
                  showSuccess && '!bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]',
                )}
              >
                {showSuccess ? (
                  <Check className="h-5 w-5" />
                ) : isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <LogIn className="h-5 w-5" />
                )}
                <span>
                  {showSuccess ? 'Signed In' : isSubmitting ? 'Signing in…' : 'Sign In'}
                </span>
              </button>
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
                  className={cn(inputClasses, fieldErrors.email && 'ring-2 ring-destructive/50')}
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="text-xs text-destructive">
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
                  className={cn(inputClasses, fieldErrors.username && 'ring-2 ring-destructive/50')}
                />
                {fieldErrors.username && (
                  <p id="username-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.username}
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

              <button
                type="submit"
                disabled={isSubmitting || showSuccess}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider transition-all',
                  'bg-primary text-primary-foreground',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:bg-primary/90 active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary',
                  showSuccess && '!bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]',
                )}
              >
                {showSuccess ? (
                  <Check className="h-5 w-5" />
                ) : isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <UserPlus className="h-5 w-5" />
                )}
                <span>
                  {showSuccess ? 'Created' : isSubmitting ? 'Creating account…' : 'Create Account'}
                </span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 pt-5 border-t border-border/30">
          <button
            type="button"
            onClick={handleSteamLogin}
            disabled={steamLoading || isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#171a21] text-[#c6d4df] text-sm font-semibold hover:bg-[#1e2329] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {steamLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.4c5.304 0 9.6 4.296 9.6 9.6s-4.296 9.6-9.6 9.6S2.4 17.304 2.4 12 6.696 2.4 12 2.4zm-1.894 4.258c-1.768 0-3.202 1.434-3.202 3.202a3.202 3.202 0 004.882 2.69l2.484 3.47c.236.33.656.406.938.17l.848-.71a.63.63 0 00.104-.895l-2.484-3.47a3.202 3.202 0 00-3.57-4.457zm0 1.659c.852 0 1.543.691 1.543 1.543s-.691 1.544-1.543 1.544-1.543-.692-1.543-1.544.691-1.543 1.543-1.543z"/>
              </svg>
            )}
            <span>{steamLoading ? 'Redirecting…' : 'Continue with Steam'}</span>
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  )
}
