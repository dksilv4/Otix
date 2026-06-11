import { useState, useRef, type FormEvent } from 'react'
import { Loader2, Check, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth'
import { PasswordField } from '../molecules/password-field'
import { PasswordStrengthBar } from '../atoms/password-strength-bar'
import { extractErrorMessage, validateRegisterFields } from '../utils'

interface RegisterFormProps {
  onSuccess: () => void
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const inputClass = (hasError?: boolean) =>
    'flex min-h-[52px] w-full rounded-xl px-5 text-base outline-none transition-all placeholder:text-muted-foreground/50' + (hasError ? ' shadow-[0_0_0_1px_rgb(248_113_113_/_0.4)]' : '')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    const errors = validateRegisterFields({ email, username, password, confirmPassword, dateOfBirth })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await register(email, username, password, dateOfBirth)
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
      key="register"
      id="register-form"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onSubmit={handleSubmit}
      className="space-y-3"
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
          id="reg-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          required
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
          className={inputClass(!!fieldErrors.email)}
          style={fieldErrors.email ? undefined : { backgroundColor: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.06)' }}
        />
        {fieldErrors.email && (
          <p id="reg-email-error" role="alert" className="text-xs text-destructive">
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
          aria-describedby={fieldErrors.username ? 'reg-username-error' : undefined}
          className={inputClass(!!fieldErrors.username)}
          style={fieldErrors.username ? undefined : { backgroundColor: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.06)' }}
        />
        {fieldErrors.username && (
          <p id="reg-username-error" role="alert" className="text-xs text-destructive">
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
          aria-describedby={fieldErrors.dateOfBirth ? 'reg-dob-error' : undefined}
          className={inputClass(!!fieldErrors.dateOfBirth)}
          style={Object.assign({ colorScheme: 'dark' }, fieldErrors.dateOfBirth ? undefined : { backgroundColor: 'var(--dk-surface-glass)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.06)' })}
        />
        {fieldErrors.dateOfBirth && (
          <p id="reg-dob-error" role="alert" className="text-xs text-destructive">
            {fieldErrors.dateOfBirth}
          </p>
        )}
      </div>

      <PasswordField
        id="reg-password"
        name="password"
        label=""
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <PasswordStrengthBar password={password} />

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

      <div className="flex justify-center pt-1">
        <button
          type="submit"
          id="register-submit"
          disabled={isSubmitting || showSuccess}
          className={'flex h-14 w-14 items-center justify-center rounded-full transition-all ' + (showSuccess ? 'bg-green-500' : 'bg-white/10 hover:bg-white/20') + ' disabled:opacity-50'}
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
  )
}
