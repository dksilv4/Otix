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
    <div id={`${id}-field`} className={'space-y-1.5' + (className ? ' ' + className : '')}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
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
          className={'flex min-h-[52px] w-full rounded-xl px-5 pr-12 text-base outline-none transition-all placeholder:text-white/30' + (error ? ' shadow-[0_0_0_1px_rgb(248_113_113_/_0.4)] focus:shadow-[0_0_0_1px_rgb(248_113_113_/_0.5)]' : '')}
          style={error ? undefined : { boxShadow: "inset 0 1px 1px rgba(0,0,0,0.2)" }}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.boxShadow = "inset 0 1px 1px rgba(0,0,0,0.2)"
            }
          }}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 transition-colors hover:text-white/60"
          style={{ color: "color-mix(in srgb, white 25%, transparent)" }}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs" style={{ color: "rgb(252 165 165)" }}>
          {error}
        </p>
      )}
    </div>
  )
}
