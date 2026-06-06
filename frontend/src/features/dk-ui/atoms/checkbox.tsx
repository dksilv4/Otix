import { forwardRef, useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import './checkbox.scss'

interface DkCheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

const DkCheckbox = forwardRef<HTMLInputElement, DkCheckboxProps>(
  ({ checked, onCheckedChange, disabled, label, className }, ref) => {
    const id = useId()

    return (
      <label htmlFor={id} className={cn('dk-checkbox', disabled && 'dk-checkbox--disabled', className)}>
        <span className="dk-checkbox__box-wrap">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="dk-checkbox__input"
          />
          <span
            className={cn('dk-checkbox__box', checked && 'dk-checkbox__box--checked')}
          />
          {checked && (
            <Check className="dk-checkbox__check" strokeWidth={3} />
          )}
        </span>
        {label && <span className="dk-checkbox__label">{label}</span>}
      </label>
    )
  },
)
DkCheckbox.displayName = 'DkCheckbox'

export { DkCheckbox }
