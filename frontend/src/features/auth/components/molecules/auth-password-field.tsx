import { useState, useId } from 'react'
import { Eye, EyeOff } from 'lucide-react'

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

/** Password input with visibility toggle and error display. */
export const PasswordField = ({
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
}: PasswordFieldProps) => {
  const autoId = useId()
  const id = idProp || autoId
  const errorId = `${id}-error`
  const [visible, setVisible] = useState(false)

  return (
    <div className={'space-y-1.5' + (className ? ' ' + className : '')}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          {label}
        </label>
      )}
      <div className="relative">
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
          className={
            'flex min-h-[52px] w-full rounded-xl px-5 pr-12 text-base outline-none transition-all placeholder:text-muted-foreground/50 text-foreground' +
            (error
              ? ' ring-1 ring-destructive focus:ring-destructive'
              : ' border border-[var(--dk-separator)]')
          }
          style={
            error
              ? undefined
              : {
                  backgroundColor: 'var(--dk-surface-glass)',
                  backdropFilter: 'blur(12px)',
                }
          }
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
