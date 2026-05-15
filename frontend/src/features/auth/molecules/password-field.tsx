import { useState, useId } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
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
          className={cn(
            'flex min-h-[52px] w-full rounded-xl bg-[var(--dk-surface-glass)] px-5 pr-12 text-base transition-all duration-200 placeholder:text-white/30',
            'focus:outline-none focus:ring-1 focus:ring-white/25 focus:bg-[var(--dk-surface-glass-hover)]',
            'hover:bg-[var(--dk-surface-glass-hover)]',
            'shadow-[inset_0_1px_1px_rgba(0,0,0,0.2)]',
            error && 'ring-1 ring-red-400/40 focus:ring-red-400/50',
          )}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white/25 hover:text-white/60 transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
