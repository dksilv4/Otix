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
  default: 'bg-white/5 text-white/50',
  success: 'bg-emerald-500/10 text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-400',
  danger: 'bg-red-500/10 text-red-400',
  info: 'bg-sky-500/10 text-sky-400',
  system: 'bg-sky-500/10 text-sky-400',
}

const DOT_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-white/40',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-sky-400',
  system: 'bg-sky-400',
}

export function Badge({ tone = 'default', dot, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} />}
      {children}
    </span>
  )
}
