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
    <div ref={ref} className={cn('relative', isFilter ? 'inline-block' : 'w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isFilter
            ? cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                value
                  ? 'bg-primary/20 text-primary hover:bg-primary/25'
                  : 'bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.08]',
              )
            : cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 h-9 text-sm w-full transition-all duration-200 text-left',
                open
                  ? 'bg-white/[0.08] text-white shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.15)]'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] text-white/80 hover:text-white',
              )
        }
      >
        <span className={cn('truncate', !isFilter && !selected && 'text-white/30')}>
          {isFilter ? `${label ? `${label}: ` : ''}${selected?.label ?? options[0]?.label ?? ''}` : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-white/40 shrink-0 transition-transform duration-200', open && 'rotate-180')}
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
              className="absolute top-full mt-2 min-w-[160px] p-1 rounded-xl z-50 bg-[#0a0a0d]/90 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
              style={{
                backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.45)',
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
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
                    'w-full text-left transition-colors duration-150 px-3 py-2 rounded-lg text-sm',
                    opt.value === value
                      ? 'bg-primary/20 text-primary font-medium hover:bg-primary/25'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.06]',
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
            className="absolute top-full mt-1 min-w-full rounded-xl p-1 z-50 bg-[#0a0a0d]/90 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] max-h-60 overflow-y-auto scrollbar-none"
            style={{
              backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.45)',
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'w-full text-left transition-colors duration-150 px-3 py-2 rounded-lg text-sm',
                  opt.value === value
                    ? 'bg-primary/20 text-primary font-medium hover:bg-primary/25'
                    : 'text-white/70 hover:text-white hover:bg-white/[0.06]',
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
