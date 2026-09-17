// TODO: Review this file
import { forwardRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DkSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
}

const DkSelect = forwardRef<HTMLSelectElement, DkSelectProps>(
  ({ className, label, hint, error, id, required, children, ...props }, ref) => {
    const autoId = useId()
    const selectId = id || autoId
    const errorId = `${selectId}-error`
    const hintId = `${selectId}-hint`

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={selectId} className="block pl-4 text-sm font-medium text-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={cn(
              'flex h-12 w-full rounded-xl px-4 pr-10 text-base appearance-none bg-[var(--dk-surface-glass)] backdrop-blur-[12px] hover:bg-[var(--dk-surface-glass-hover)] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:[--tw-ring-color:var(--dk-ring-color)]',
              error && 'shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_40%,transparent)] focus:[--tw-ring-color:color-mix(in_srgb,var(--destructive)_40%,transparent)]',
              props.disabled && 'opacity-40 cursor-not-allowed',
              className,
            )}
            style={{ transition: 'all var(--dk-duration-fast) var(--dk-ease-out)' }}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {hint && !error && (
          <p id={hintId} className="pl-4 text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="pl-4 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkSelect.displayName = 'DkSelect'

export { DkSelect }
