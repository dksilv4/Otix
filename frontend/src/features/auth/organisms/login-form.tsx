import { useState, useRef, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2, Check, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth'
import { PasswordField } from '../molecules/password-field'
import { extractErrorMessage } from '../utils'

interface LoginFormProps {
  onSuccess: () => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth()
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ identity?: string; password?: string }>({})
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  function validate() {
    const errors: { identity?: string; password?: string } = {}
    if (!identity.trim()) errors.identity = 'Username or email is required'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    return errors
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await login(identity, password)
      setShowSuccess(true)
      setTimeout(onSuccess, 600)
    } catch (err) {
      setAuthError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.form
      key="login"
      id="login-form"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <AnimatePresence>
        {authError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-xl px-4 py-3 text-sm text-destructive"
            style={{ backgroundColor: 'color-mix(in srgb, var(--destructive) 10%, transparent)' }}
          >
            {authError}
          </motion.div>
        )}
      </AnimatePresence>

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
          className={'flex min-h-[52px] w-full rounded-xl px-5 text-base outline-none transition-all placeholder:text-muted-foreground/50' + (fieldErrors.identity ? ' shadow-[0_0_0_1px_rgb(248_113_113_/_0.4)]' : '')}
          style={fieldErrors.identity ? undefined : { backgroundColor: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.06)' }}
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
        value={password}
        onChange={setPassword}
        placeholder="Enter your password"
        autoComplete="current-password"
        error={fieldErrors.password}
      />

      <div className="flex justify-end">
        <Link
          to="/auth/forgot-password"
          className="text-xs text-muted-foreground transition-colors hover:text-white/80"
        >
          Forgot password?
        </Link>
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="submit"
          id="login-submit"
          disabled={isSubmitting || showSuccess}
          className={'flex h-14 w-14 items-center justify-center rounded-full transition-all ' + (showSuccess ? 'bg-green-500' : 'bg-white/10 hover:bg-white/20') + ' disabled:opacity-50'}
          aria-label="Sign in"
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
  )
}
