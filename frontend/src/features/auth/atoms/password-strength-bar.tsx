import { cn } from '@/lib/utils'
import { calculatePasswordStrength, getStrengthTier, getTierLabel } from '../utils'

interface PasswordStrengthBarProps {
  password: string
  className?: string
}

const tierColors: Record<string, { bar: string; glow: string }> = {
  weak: { bar: 'bg-destructive', glow: 'shadow-[0_0_10px_rgba(239,68,68,0.4)]' },
  fair: { bar: 'bg-orange-400', glow: 'shadow-[0_0_10px_rgba(251,146,60,0.4)]' },
  good: { bar: 'bg-blue-500', glow: 'shadow-[0_0_10px_rgba(59,130,246,0.4)]' },
  strong: { bar: 'bg-green-500', glow: 'shadow-[0_0_10px_rgba(34,197,94,0.4)]' },
}

export function PasswordStrengthBar({ password, className }: PasswordStrengthBarProps) {
  if (!password) return null

  const score = calculatePasswordStrength(password)
  const tier = getStrengthTier(score)
  const colors = tierColors[tier]
  const activeCount = tier === 'weak' ? 1 : tier === 'fair' ? 2 : tier === 'good' ? 3 : 4

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              i < activeCount ? `${colors.bar} ${colors.glow}` : 'bg-white/10',
            )}
          />
        ))}
      </div>
      <p
        className="text-xs"
        style={{ color: tier === 'weak' ? 'var(--destructive)' : tier === 'fair' ? '#f59e0b' : tier === 'good' ? '#3b82f6' : '#22c55e' }}
      >
        {getTierLabel(tier)}
      </p>
    </div>
  )
}
