import { cn } from '@/lib/utils'
import './separator.scss'

interface DkSeparatorProps {
  className?: string
  label?: string
}

function DkSeparator({ className, label }: DkSeparatorProps) {
  if (label) {
    return (
      <div className={cn('dk-separator', className)}>
        <span className="dk-separator__line" />
        <span className="dk-separator__label">{label}</span>
        <span className="dk-separator__line" />
      </div>
    )
  }

  return (
    <div
      className={cn('dk-separator--plain', className)}
      role="separator"
      aria-orientation="horizontal"
    />
  )
}

export { DkSeparator }
