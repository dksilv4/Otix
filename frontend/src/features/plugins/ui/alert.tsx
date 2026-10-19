import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertTone = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  tone?: AlertTone
  title?: string
  children: ReactNode
  className?: string
  dismissible?: boolean
  onDismiss?: () => void
}

const TONE_META: Record<AlertTone, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  info: { icon: Info, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
}

export const Alert = ({ tone = 'info', title, children, className, dismissible, onDismiss }: AlertProps) => {
  const meta = TONE_META[tone]
  const Icon = meta.icon
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', meta.bg, meta.border, className)}>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', meta.color)} />
      <div className="flex-1 min-w-0">
        {title && <div className={cn('text-sm font-semibold', meta.color)}>{title}</div>}
        <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
      </div>
      {dismissible && (
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  )
};
