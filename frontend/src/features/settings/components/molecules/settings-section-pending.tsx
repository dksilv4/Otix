import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SettingsSectionPendingProps {
  className?: string
}

export const SettingsSectionPending = ({ className }: SettingsSectionPendingProps) => {
  return (
    <div
      className={cn(
        'flex min-h-[320px] w-full flex-1 flex-col items-center justify-center gap-3 py-20 text-muted-foreground',
        className,
      )}
      aria-label="Loading settings section…"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-xs font-medium tracking-wide">Loading settings…</span>
    </div>
  )
};
