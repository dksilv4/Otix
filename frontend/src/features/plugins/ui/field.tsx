import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label?: string
  description?: string
  error?: string
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function Field({ label, description, error, required, htmlFor, children, className }: FieldProps) {
  const generatedId = useId()
  const id = htmlFor || generatedId

  // Associate the single control child with the label (a11y + label queries).
  // When an explicit htmlFor is passed, the caller manages the association.
  let control: ReactNode = children
  if (!htmlFor && Children.count(children) === 1) {
    const child = Children.only(children)
    if (isValidElement(child)) {
      const el = child as ReactElement<{ id?: string }>
      control = cloneElement(el, { id: el.props.id || id })
    }
  }

  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      {label && (
        <label
          htmlFor={id}
          className="flex items-baseline justify-between gap-2 text-xs font-medium text-white/60"
        >
          <span>
            {label}
            {required && <span className="ml-0.5 text-red-400">*</span>}
          </span>
        </label>
      )}
      {description && <p className="text-[11px] text-white/35 leading-relaxed">{description}</p>}
      {control}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
