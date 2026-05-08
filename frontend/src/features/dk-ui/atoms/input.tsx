import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

interface DkInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

const DkInput = forwardRef<HTMLInputElement, DkInputProps>(
  ({ className, label, hint, error, id, required, ...props }, ref) => {
    const autoId = useId()
    const inputId = id || autoId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={
            error ? errorId : hint ? hintId : undefined
          }
          className={cn(
            'flex h-12 w-full rounded-xl bg-[var(--dk-surface-glass)] px-4 text-base backdrop-blur-md',
            'transition-all duration-[var(--dk-duration-fast)]',
            'placeholder:text-muted-foreground/50',
            'hover:bg-[var(--dk-surface-glass-hover)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1',
            error &&
              'ring-2 ring-destructive/40 focus:ring-destructive/40',
            props.disabled && 'opacity-40 cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkInput.displayName = 'DkInput'

export { DkInput }
