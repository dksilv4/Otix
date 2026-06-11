import { useState, type FormEvent } from 'react'
import { Shield, ArrowRight, ArrowLeft, Loader2, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth'
import { extractErrorMessage } from '../utils'

interface TwoFactorChallengeProps {
  onSuccess: () => void
  onCancel: () => void
}

export function TwoFactorChallenge({ onSuccess, onCancel }: TwoFactorChallengeProps) {
  const { verifyTwoFactor } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError('')
    setIsSubmitting(true)
    try {
      await verifyTwoFactor(code)
      setShowSuccess(true)
      setTimeout(onSuccess, 600)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form id="two-factor-challenge" onSubmit={handleSubmit} className="space-y-5">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
          <Shield className="h-7 w-7 text-white/50" />
        </div>
      </div>

      <p className="text-center text-sm" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
        Enter the 6-digit code from your authenticator app.
      </p>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl px-4 py-2 text-center text-sm"
          style={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', color: 'rgb(252 165 165)' }}
        >
          {error}
        </motion.div>
      )}

      <div className="flex justify-center">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          autoFocus
          className="h-14 w-36 rounded-xl text-center text-2xl tracking-[0.25em] outline-none"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.2)' }}
        />
      </div>

      <div className="flex justify-center">
        <button
          type="submit"
          id="totp-submit"
          disabled={code.length !== 6 || isSubmitting || showSuccess}
          className={'flex h-14 w-14 items-center justify-center rounded-full transition-all ' + (showSuccess ? 'bg-green-500' : 'bg-white/10 hover:bg-white/20') + ' disabled:opacity-50'}
          aria-label="Verify code"
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

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs transition-colors hover:text-white/80"
          style={{ color: 'rgba(255, 255, 255, 0.4)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </button>
      </div>
    </form>
  )
}
