// TODO: Review this file
import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'
import './input.scss'

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
      <div className="dk-input">
        {label && (
          <label htmlFor={inputId} className="dk-input__label">
            {label}
            {required && <span className="dk-input__required">*</span>}
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
            'dk-input__field',
            error && 'dk-input__field--error',
            props.disabled && 'dk-input__field--disabled',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="dk-input__hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="dk-input__error">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkInput.displayName = 'DkInput'

export { DkInput, DkInput as Input }
export type { DkInputProps }
