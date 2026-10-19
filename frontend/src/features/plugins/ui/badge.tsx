import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'system'

interface BadgeProps {
  tone?: BadgeTone
  dot?: boolean
  className?: string
  children: ReactNode
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] text-muted-foreground',
  success: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400',
  danger: 'bg-destructive/10 border border-destructive/20 text-destructive',
  info: 'bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400',
  system: 'bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400',
}

export const Badge = ({ tone = 'default', className, children }: BadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
};
