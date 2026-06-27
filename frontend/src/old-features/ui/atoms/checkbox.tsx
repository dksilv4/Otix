import { forwardRef, useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DkCheckboxProps {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

const DkCheckbox = forwardRef<HTMLInputElement, DkCheckboxProps>(
  ({ checked, onCheckedChange, disabled, label, className }, ref) => {
    const id = useId()

    return (
      <label htmlFor={id} className={cn('inline-flex items-center gap-3', disabled && 'opacity-40', className)}>
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className="peer sr-only"
          />
          <span
            className={cn(
              'absolute inset-0 rounded-md peer-focus-visible:shadow-[0_0_0_2px_var(--dk-ring-color)] peer-hover:bg-[var(--dk-surface-glass-hover)]',
              checked && 'bg-primary',
            )}
            style={{
              boxShadow: checked ? undefined : 'inset 0 0 0 1px var(--dk-separator)',
              backgroundColor: checked ? undefined : 'var(--dk-surface-glass)',
              transition: 'all var(--dk-duration-fast) var(--dk-ease-out)',
            }}
          />
          {checked && (
            <Check className="relative z-10 h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
          )}
        </span>
        {label && <span className="text-sm">{label}</span>}
      </label>
    )
  },
)
DkCheckbox.displayName = 'DkCheckbox'

export { DkCheckbox }
