import { useState, useRef, type FormEvent } from 'react'
import { Loader2, Check, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@auth/hooks/use-auth'
import { PasswordField } from '@auth/components/molecules/auth-password-field'
import { PasswordStrengthBar } from '@auth/components/atoms/auth-password-strength-bar'
import { extractErrorMessage, validateRegisterFields } from '@auth/utils'

interface RegisterFormProps {
  onSuccess: () => void
}

/** Registration form organism with email, username, date of birth, and password fields. */
export const RegisterForm = ({ onSuccess }: RegisterFormProps) => {
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [agreeConsent, setAgreeConsent] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const inputClass = (hasError?: boolean) =>
    'flex min-h-[52px] w-full rounded-xl px-5 text-base outline-none transition-all placeholder:text-muted-foreground/50 text-foreground' +
    (hasError ? ' ring-1 ring-destructive focus:ring-destructive' : ' border border-[var(--dk-separator)]')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setAuthError('')
    const errors = validateRegisterFields({ email, username, password, confirmPassword, dateOfBirth })
    if (!agreeConsent) {
      errors.consent = 'You must confirm your age and agree to the Terms and Privacy Policy.'
    }
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
          style={
            fieldErrors.email
              ? undefined
              : {
                  backgroundColor: 'var(--dk-surface-glass)',
                  backdropFilter: 'blur(12px)',
                }
          }
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
          style={
            fieldErrors.username
              ? undefined
              : {
                  backgroundColor: 'var(--dk-surface-glass)',
                  backdropFilter: 'blur(12px)',
                }
          }
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
          style={
            fieldErrors.dateOfBirth
              ? undefined
              : {
                  backgroundColor: 'var(--dk-surface-glass)',
                  backdropFilter: 'blur(12px)',
                }
          }
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

      <div className="pt-2">
        <label className="flex items-start gap-2.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            id="reg-consent"
            name="consent"
            type="checkbox"
            checked={agreeConsent}
            onChange={(e) => {
              setAgreeConsent(e.target.checked)
              if (fieldErrors.consent) {
                setFieldErrors((prev) => {
                  const copy = { ...prev }
                  delete copy.consent
                  return copy
                })
              }
            }}
            required
            className="mt-0.5 h-4 w-4 rounded border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] text-primary accent-primary focus:ring-primary focus:ring-offset-0 cursor-pointer shrink-0"
          />
          <span className="leading-relaxed">
            I confirm that I am at least 13 years of age and agree to Otix&apos;s{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-primary"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-primary"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {fieldErrors.consent && (
          <p id="reg-consent-error" role="alert" className="mt-1 text-xs text-destructive">
            {fieldErrors.consent}
          </p>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <button
          type="submit"
          id="register-submit"
          disabled={isSubmitting || showSuccess}
          className={
            'cursor-pointer flex h-14 w-14 items-center justify-center rounded-full transition-all ' +
            (showSuccess ? 'bg-emerald-500 text-primary-foreground' : 'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] text-foreground') +
            ' disabled:opacity-50'
          }
          aria-label="Create account"
        >
          {showSuccess ? (
            <Check className="h-6 w-6 text-primary-foreground" />
          ) : isSubmitting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ArrowRight className="h-6 w-6" />
          )}
        </button>
      </div>
    </motion.form>
  )
};
