import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

interface DkTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

const DkTextarea = forwardRef<HTMLTextAreaElement, DkTextareaProps>(
  ({ className, label, hint, error, id, required, ...props }, ref) => {
    const autoId = useId()
    const textareaId = id || autoId
    const errorId = `${textareaId}-error`
    const hintId = `${textareaId}-hint`

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={
            error ? errorId : hint ? hintId : undefined
          }
          className={cn(
            'flex min-h-[80px] w-full rounded-xl bg-[var(--dk-surface-glass)] px-4 py-3 text-base backdrop-blur-md',
            'transition-all duration-[var(--dk-duration-fast)]',
            'placeholder:text-muted-foreground/50',
            'hover:bg-[var(--dk-surface-glass-hover)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1',
            'resize-vertical',
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
DkTextarea.displayName = 'DkTextarea'

export { DkTextarea }
