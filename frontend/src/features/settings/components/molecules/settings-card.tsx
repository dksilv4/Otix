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
export function SettingsCard({ children, className, compact, tone = 'default' }: SettingsCardProps) {
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
            ? 'oklch(from var(--dk-surface-base) l c h / 0.42)'
            : 'var(--dk-surface-base)',
        boxShadow:
          tone === 'raised'
            ? 'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 12px 32px -18px rgba(0,0,0,0.5)'
            : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 10px 30px -10px rgba(0, 0, 0, 0.5)',
      }}
    >
      {children}
    </div>
  )
}
