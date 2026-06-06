// TODO: Review this file
import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'
import './textarea.scss'

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
      <div className="dk-textarea">
        {label && (
          <label htmlFor={textareaId} className="dk-textarea__label">
            {label}
            {required && <span className="dk-textarea__required">*</span>}
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
            'dk-textarea__field',
            error && 'dk-textarea__field--error',
            props.disabled && 'dk-textarea__field--disabled',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="dk-textarea__hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="dk-textarea__error">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkTextarea.displayName = 'DkTextarea'

export { DkTextarea }
