import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingsCardProps {
  children: ReactNode
  className?: string
  /** Tighter padding for compact rows */
  compact?: boolean
  /** `raised` uses a stronger fill for dense admin/metric pages. */
  tone?: 'default' | 'raised'
}

/**
 * Standardized glass settings card container.
 * Replaces ad-hoc `rounded-2xl sm:rounded-3xl p-5 sm:p-6 bg-white/5 backdrop-blur-xl` wrappers.
 */
export const SettingsCard = ({ children, className, compact, tone = 'default' }: SettingsCardProps) => {
  return (
    <div
      className={cn(
        'rounded-2xl sm:rounded-3xl backdrop-blur-xl transition-all duration-200',
        compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
        className,
      )}
      style={{
        backgroundColor:
          tone === 'raised'
            ? 'color-mix(in oklch, var(--dk-surface-raised) 75%, transparent)'
            : 'var(--dk-surface-base)',
        boxShadow:
          tone === 'raised'
            ? 'var(--dk-shadow-md)'
            : 'var(--dk-shadow-sm)',
      }}
    >
      {children}
    </div>
  )
};
