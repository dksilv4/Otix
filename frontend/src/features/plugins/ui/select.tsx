import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, invalid, className, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full h-9 rounded-xl bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] pl-3 pr-9 text-sm text-foreground',
            'appearance-none outline-none transition-all cursor-pointer',
            'focus:border-primary focus:ring-1 focus:ring-primary/30',
            invalid && 'border-destructive/60 focus:border-destructive',
            className,
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[var(--dk-surface-overlay)] text-foreground">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
    )
  },
)
Select.displayName = 'Select'
