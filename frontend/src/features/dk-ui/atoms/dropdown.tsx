import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DkDropdownOption {
  value: string
  label: string
}

interface DkDropdownProps {
  options: DkDropdownOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DkDropdown({ options, value, onChange, placeholder = 'Select...', className }: DkDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-field)] px-2 py-1 text-xs',
          'hover:border-[var(--dk-border-accent)] transition-colors',
        )}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground/50'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-48 rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-elevated)] shadow-lg py-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                'w-full px-2.5 py-1.5 text-left text-xs hover:bg-[var(--dk-surface-glass-hover)] transition-colors',
                opt.value === value && 'bg-primary/10 text-primary font-medium',
              )}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
