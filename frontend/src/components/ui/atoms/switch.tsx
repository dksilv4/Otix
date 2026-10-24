import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface DkSwitchProps {
  id?: string
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

const DkSwitch = forwardRef<HTMLButtonElement, DkSwitchProps>(
  ({ id, checked, onCheckedChange, disabled, label, className }, ref) => {
    const trackTransition = 'all var(--dk-duration-fast) var(--dk-ease-out)'

    return (
      <label className={cn('inline-flex items-center gap-3', disabled && 'opacity-40', className)}>
        <button
          ref={ref}
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange?.(!checked)}
          className={cn(
            'relative h-6 w-11 rounded-full',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--dk-ring-color)]',
            checked ? 'bg-primary' : 'bg-[var(--muted)]',
          )}
          style={{ transition: trackTransition }}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm',
              checked && 'translate-x-5',
            )}
            style={{ transition: trackTransition }}
          />
        </button>
        {label && <span className="text-sm">{label}</span>}
      </label>
    )
  },
)
DkSwitch.displayName = 'DkSwitch'

export { DkSwitch }
