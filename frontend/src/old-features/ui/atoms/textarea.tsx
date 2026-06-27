// TODO: Review this file
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
          <label htmlFor={textareaId} className="text-sm font-medium text-[var(--foreground)]">
            {label}
            {required && <span className="ml-0.5 text-[var(--destructive)]">*</span>}
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
            'flex min-h-[80px] w-full rounded-xl px-4 py-3 text-base',
            'bg-[var(--dk-surface-glass)] backdrop-blur-md resize-y',
            'placeholder:text-[var(--muted-foreground)] placeholder:opacity-50',
            'hover:bg-[var(--dk-surface-glass-hover)]',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            error
              ? 'focus:ring-[color-mix(in_srgb,var(--destructive)_40%,transparent)]'
              : 'focus:ring-[var(--dk-ring-color)]',
            props.disabled && 'opacity-40 cursor-not-allowed',
            className,
          )}
          style={{
            transition: 'all var(--dk-duration-fast) var(--dk-ease-out)',
            ...(error ? { boxShadow: '0 0 0 2px color-mix(in srgb, var(--destructive) 40%, transparent)' } : {}),
          }}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--muted-foreground)]">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-[var(--destructive)]">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkTextarea.displayName = 'DkTextarea'

export { DkTextarea }
