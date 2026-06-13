import { cn } from '@/lib/utils'

interface DkSeparatorProps {
  className?: string
  label?: string
}

function DkSeparator({ className, label }: DkSeparatorProps) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-4', className)}>
        <span className="h-px flex-1 bg-[var(--dk-separator)]" />
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="h-px flex-1 bg-[var(--dk-separator)]" />
      </div>
    )
  }

  return (
    <div
      className={cn('h-px w-full bg-[var(--dk-separator)]', className)}
      role="separator"
      aria-orientation="horizontal"
    />
  )
}

export { DkSeparator }
