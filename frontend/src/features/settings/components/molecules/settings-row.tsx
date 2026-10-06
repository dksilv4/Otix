import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingsRowProps {
  icon?: ReactNode
  label: string
  description?: string
  action: ReactNode
  disabled?: boolean
  className?: string
}

/**
 * Standardized settings toggle/action row.
 * Optional icon + label/description on the left, action (switch/button/dropdown) on the right.
 */
export const SettingsRow = ({ icon, label, description, action, disabled, className }: SettingsRowProps) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl px-4 py-3.5 transition-all duration-200 hover:bg-white/[0.04]',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      style={{
        backgroundColor: 'var(--dk-surface-raised)',
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.04)',
      }}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{label}</p>
          {description && <p className="truncate text-xs text-white/50 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="ml-3 shrink-0">{action}</div>
    </div>
  )
};
