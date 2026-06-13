import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DkDropdownOption {
  value: string
  label: string
}

interface DkDropdownProps<T extends string = string> {
  options: readonly DkDropdownOption[]
  value?: T
  onChange: (value: T) => void
  placeholder?: string
  className?: string
  variant?: 'default' | 'filter'
  label?: string
}

export function DkDropdown<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className,
  variant = 'default',
  label,
}: DkDropdownProps<T>) {
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
  const isFilter = variant === 'filter'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isFilter
          ? cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              value
                ? 'bg-primary/15 text-primary'
                : 'bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.08]',
            )
          : 'flex items-center gap-1 rounded-lg px-2 py-1 text-xs bg-[var(--dk-surface-field)] hover:border-[var(--dk-border-accent)]'
        }
        style={isFilter ? { transition: 'all 200ms ease' } : { transition: 'border-color var(--dk-duration-fast) var(--dk-ease-out)' }}
      >
        <span className={!isFilter && !selected ? 'text-muted-foreground/50' : ''}>
          {isFilter ? `${label ? `${label}: ` : ''}${selected?.label ?? options[0]?.label ?? ''}` : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown
          className={cn('h-3 w-3 text-muted-foreground', open && 'rotate-180')}
          style={{ transition: 'transform var(--dk-duration-fast) var(--dk-ease-out)' }}
        />
      </button>

      {isFilter ? (
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="top-full mt-2 min-w-[160px] p-2 rounded-[1.25rem] backdrop-blur-2xl"
              style={{
                backgroundColor: 'var(--dk-surface-overlay)',
                boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px rgba(255,255,255,0.06)',
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value as T)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left transition-colors duration-150 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                    opt.value === value && 'bg-primary/15 text-primary',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        open && (
          <div
            className="mt-1 w-48 rounded-lg py-0.5 absolute z-50 shadow-lg"
            style={{ backgroundColor: 'var(--dk-surface-elevated)' }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'w-full text-left transition-colors duration-150 px-2.5 py-1.5 text-xs hover:bg-[var(--dk-surface-glass-hover)]',
                  opt.value === value && 'bg-primary/10 text-primary font-medium',
                )}
                onClick={() => {
                  onChange(opt.value as T)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}
