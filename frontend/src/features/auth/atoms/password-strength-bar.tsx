import { cn } from '@/lib/utils'
import { calculatePasswordStrength, getStrengthTier, getTierLabel } from '../utils'
import './password-strength-bar.scss'

interface PasswordStrengthBarProps {
  password: string
  className?: string
}

export function PasswordStrengthBar({ password, className }: PasswordStrengthBarProps) {
  if (!password) return null

  const score = calculatePasswordStrength(password)
  const tier = getStrengthTier(score)
  const activeCount = tier === 'weak' ? 1 : tier === 'fair' ? 2 : tier === 'good' ? 3 : 4

  return (
    <div className={cn('dk-auth-password-strength', className)}>
      <div className="dk-auth-password-strength__bars">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'dk-auth-password-strength__bar',
              i < activeCount
                ? `dk-auth-password-strength__bar--${tier}`
                : 'dk-auth-password-strength__bar--inactive',
            )}
          />
        ))}
      </div>
      <p className={`dk-auth-password-strength__label dk-auth-password-strength__label--${tier}`}>
        {getTierLabel(tier)}
      </p>
    </div>
  )
}
