import { calculatePasswordStrength, getStrengthTier, getTierLabel } from '@auth/utils'

interface PasswordStrengthBarProps {
  password: string
  className?: string
}

const TIER_STYLES: Record<string, { bar: string; label: string }> = {
  weak: { bar: 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.4)]', label: 'text-destructive' },
  fair: { bar: 'bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.4)]', label: 'text-amber-500' },
  good: { bar: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]', label: 'text-blue-500' },
  strong: { bar: 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]', label: 'text-green-500' },
}

export const PasswordStrengthBar = ({ password, className }: PasswordStrengthBarProps) => {
  if (!password) return null

  const score = calculatePasswordStrength(password)
  const tier = getStrengthTier(score)
  const activeCount = tier === 'weak' ? 1 : tier === 'fair' ? 2 : tier === 'good' ? 3 : 4

  return (
    <div className={'space-y-1.5' + (className ? ' ' + className : '')}>
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={
              'h-1.5 rounded-full transition-all duration-500' +
              (i < activeCount ? ' ' + TIER_STYLES[tier].bar : ' bg-white/10')
            }
          />
        ))}
      </div>
      <p className={'text-xs transition-colors duration-500 ' + TIER_STYLES[tier].label}>
        {getTierLabel(tier)}
      </p>
    </div>
  )
}
