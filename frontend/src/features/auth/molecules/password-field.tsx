// TODO: Review this file
import { useState, useId } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import './password-field.scss'

interface PasswordFieldProps {
  id?: string
  name?: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  autoComplete?: string
  required?: boolean
  className?: string
}

export function PasswordField({
  id: idProp,
  name,
  label,
  value,
  onChange,
  placeholder = 'Password',
  error,
  autoComplete,
  required = true,
  className,
}: PasswordFieldProps) {
  const autoId = useId()
  const id = idProp || autoId
  const errorId = `${id}-error`
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('dk-auth-password-field', className)}>
      {label && (
        <label htmlFor={id} className="dk-auth-password-field__label">
          {label}
        </label>
      )}
      <div className="dk-auth-password-field__input-wrap">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'dk-auth-password-field__input',
            error && 'dk-auth-password-field__input--error',
          )}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="dk-auth-password-field__toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="dk-auth-password-field__error">
          {error}
        </p>
      )}
    </div>
  )
}
