// TODO: Review this file
import './auth-page.scss'
import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react'
import { Helmet } from 'react-helmet-async'
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
import { isDesktop } from '@/lib/desktop-api'
import { openExternal } from '@/lib/open-external'

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
      const { data } = await apiClient.post('/auth/steam/initiate', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl)
    } catch {
      setSteamLoading(false)
    }
  }

  const isLogin = mode === 'login'
  const router = useRouter()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  return (
    <div className="dk-auth-page__wrapper">
      <Helmet>
        <title>{isLogin ? 'Sign In - Otix' : 'Create Account - Otix'}</title>
        <meta name="description" content={isLogin ? 'Sign in to Otix to continue your journey.' : 'Create an account on Otix to track movies, shows, game, and music.'} />
        <meta name="robots" content="noindex" />
      </Helmet>
      {canGoBack && (
        <div className="dk-auth-page__back">
          <button
            type="button"
            onClick={() => router.history.back()}
            className="dk-auth-page__back-btn"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      <div
        className="dk-auth-page__card"
        style={{ animation: 'authFormFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <div className="dk-auth-page__logo">
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
          <form onSubmit={handleVerifyTwoFactor} className="dk-auth-page__totp-form">
            <div className="dk-auth-page__totp-shield">
              <div className="dk-auth-page__totp-shield-icon">
                <Shield className="h-7 w-7 text-white/50" />
              </div>
            </div>
            <p className="dk-auth-page__totp-desc">
              Enter the 6-digit code from your authenticator app.
            </p>

            {totpError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="dk-auth-page__totp-error"
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
              className="dk-auth-page__totp-input"
            />

            <div className="dk-auth-page__totp-submit">
              <button
                type="submit"
                disabled={totpCode.length !== 6 || totpSubmitting || showSuccess}
                className={cn('dk-auth-page__submit-btn', showSuccess && 'dk-auth-page__submit-btn--success')}
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
              className="dk-auth-page__totp-back-btn"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          </form>
        )}

        {/* Tabs — hidden during 2FA challenge */}
        {!twoFactorChallenge && (
        <>
        <div className="dk-auth-page__tabs">
          <motion.div
            className="dk-auth-page__tabs-slider"
            initial={false}
            animate={{ left: isLogin ? '0.25rem' : '50%', width: 'calc(50% - 0.25rem)' }}
            transition={tabSpring}
          />
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn('dk-auth-page__tab', isLogin && 'dk-auth-page__tab--active')}
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn('dk-auth-page__tab', !isLogin && 'dk-auth-page__tab--active')}
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
              className="dk-auth-page__error"
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
              className="dk-auth-page__form"
            >
              <div className="dk-auth-page__input-group">
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
                  className={cn('dk-auth-page__input', fieldErrors.identity && 'dk-auth-page__input--error')}
                />
                {fieldErrors.identity && (
                  <p id="identity-error" role="alert" className="dk-auth-page__field-error">
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

              <div className="dk-auth-page__forgot-wrapper">
                <Link
                  to="/auth/forgot-password"
                  className="dk-auth-page__forgot-link"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="dk-auth-page__submit-wrapper">
                <button
                  type="submit"
                  disabled={isSubmitting || showSuccess}
                  className={cn('dk-auth-page__submit-btn', showSuccess && 'dk-auth-page__submit-btn--success')}
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
              className="dk-auth-page__form"
            >
              <div className="dk-auth-page__input-group">
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
                  className={cn('dk-auth-page__input', fieldErrors.email && 'dk-auth-page__input--error')}
                />
                {fieldErrors.email && (
                  <p id="email-error" role="alert" className="dk-auth-page__field-error">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="dk-auth-page__input-group">
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
                  className={cn('dk-auth-page__input', fieldErrors.username && 'dk-auth-page__input--error')}
                />
                {fieldErrors.username && (
                  <p id="username-error" role="alert" className="dk-auth-page__field-error">
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              <div className="dk-auth-page__input-group">
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
                  className={cn('dk-auth-page__input', fieldErrors.dateOfBirth && 'dk-auth-page__input--error')}
                />
                {fieldErrors.dateOfBirth && (
                  <p id="dob-error" role="alert" className="dk-auth-page__field-error">
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

              <div className="dk-auth-page__submit-wrapper">
                <button
                  type="submit"
                  disabled={isSubmitting || showSuccess}
                  className={cn('dk-auth-page__submit-btn', showSuccess && 'dk-auth-page__submit-btn--success')}
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

        <div className="dk-auth-page__social">
          <p className="dk-auth-page__social-label">or continue with</p>
          <div className="dk-auth-page__social-btn-wrapper">
            <button
              type="button"
              onClick={handleSteamLogin}
              disabled={steamLoading || isSubmitting}
              className="dk-auth-page__social-btn"
              aria-label="Continue with Steam"
              style={{ background: 'linear-gradient(135deg, #1b2838 0%, #1d3f5f 100%)' }}
            >
              <div className="dk-auth-page__social-btn-overlay" />
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
