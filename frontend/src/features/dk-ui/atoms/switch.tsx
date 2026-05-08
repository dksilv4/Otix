import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface DkSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

const DkSwitch = forwardRef<HTMLButtonElement, DkSwitchProps>(
  ({ checked, onCheckedChange, disabled, label, className }, ref) => {
    return (
      <label className={cn('inline-flex items-center gap-3', disabled && 'opacity-40', className)}>
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            'relative h-6 w-11 rounded-full transition-all duration-[var(--dk-duration-fast)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2',
            checked ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-[var(--dk-duration-fast)]',
              checked && 'translate-x-5',
            )}
          />
        </button>
        {label && <span className="text-sm">{label}</span>}
      </label>
    )
  },
)
DkSwitch.displayName = 'DkSwitch'

export { DkSwitch }
