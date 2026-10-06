import type { ReactNode } from 'react'
import { Loader2, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Spinner = ({ className }: { className?: string }) => {
  return <Loader2 className={cn('h-5 w-5 text-primary animate-spin', className)} />
};

export const EmptyState = ({
  icon: Icon = Inbox,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  message?: string
  action?: ReactNode
  className?: string
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <Icon className="h-9 w-9 text-white/20 mb-3" />
      <p className="text-sm text-white/40">{title}</p>
      {message && <p className="text-xs text-white/30 mt-1 max-w-xs">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
};

export const Progress = ({ value, tone = 'primary', className }: { value: number; tone?: 'primary' | 'success' | 'error'; className?: string }) => {
  const clamped = Math.max(0, Math.min(100, value))
  const color = tone === 'success' ? 'bg-emerald-400' : tone === 'error' ? 'bg-red-400' : 'bg-primary'
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-white/5 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${clamped}%` }} />
    </div>
  )
};

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => {
  return (
    <h3 className={cn('text-xs font-semibold uppercase tracking-wider text-white/40', className)}>
      {children}
    </h3>
  )
};
