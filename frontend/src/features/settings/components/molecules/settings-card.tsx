import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingsCardProps {
  children: ReactNode
  className?: string
  /** Tighter padding for compact rows */
  compact?: boolean
}

/**
 * Standardized glass settings card container.
 * Replaces ad-hoc `rounded-2xl sm:rounded-3xl p-5 sm:p-6 bg-white/5 backdrop-blur-xl` wrappers.
 */
export function SettingsCard({ children, className, compact }: SettingsCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl sm:rounded-3xl backdrop-blur-xl transition-all duration-200',
        compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
        className,
      )}
      style={{
        backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.18)',
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
      }}
    >
      {children}
    </div>
  )
}
