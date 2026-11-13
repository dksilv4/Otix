import { AlertTriangle } from 'lucide-react'

interface IncompatibleButtonProps {
  label?: string
  title?: string
}

export const IncompatibleButton = ({
  label = 'Incompatible OS',
  title,
}: IncompatibleButtonProps) => {
  return (
    <button
      className="px-5.5 py-2.5 bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] rounded-xl text-[11px] font-semibold text-muted-foreground cursor-not-allowed flex items-center gap-1.5"
      disabled
      title={title}
    >
      <AlertTriangle className="h-3.5 w-3.5 text-destructive/70" aria-hidden="true" /> {label}
    </button>
  )
};
