// TODO: Review this file
import { forwardRef, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import './select.scss'

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
      <div className="dk-select">
        {label && (
          <label htmlFor={selectId} className="dk-select__label">
            {label}
            {required && <span className="dk-select__required">*</span>}
          </label>
        )}
        <div className="dk-select__wrapper">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={!!error}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={cn(
              'dk-select__field',
              error && 'dk-select__field--error',
              props.disabled && 'dk-select__field--disabled',
              className,
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="dk-select__chevron" />
        </div>
        {hint && !error && (
          <p id={hintId} className="dk-select__hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="dk-select__error">
            {error}
          </p>
        )}
      </div>
    )
  },
)
DkSelect.displayName = 'DkSelect'

export { DkSelect }
