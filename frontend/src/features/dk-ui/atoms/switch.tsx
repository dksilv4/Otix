import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import './switch.scss'

interface DkSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

const DkSwitch = forwardRef<HTMLButtonElement, DkSwitchProps>(
  ({ checked, onCheckedChange, disabled, label, className }, ref) => {
    return (
      <label className={cn('dk-switch', disabled && 'dk-switch--disabled', className)}>
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            'dk-switch__track',
            checked ? 'dk-switch__track--on' : 'dk-switch__track--off',
          )}
        >
          <span
            className={cn('dk-switch__thumb', checked && 'dk-switch__thumb--on')}
          />
        </button>
        {label && <span className="dk-switch__label">{label}</span>}
      </label>
    )
  },
)
DkSwitch.displayName = 'DkSwitch'

export { DkSwitch }
