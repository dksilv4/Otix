import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import './dropdown.scss'

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
    <div ref={ref} className={cn('dk-dropdown', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isFilter
          ? cn(
              'dk-dropdown__trigger--filter',
              value
                ? 'dk-dropdown__trigger--filter-active'
                : 'dk-dropdown__trigger--filter-inactive',
            )
          : 'dk-dropdown__trigger'
        }
      >
        <span className={!isFilter && !selected ? 'dk-dropdown__trigger-text--placeholder' : ''}>
          {isFilter ? `${label ? `${label}: ` : ''}${selected?.label ?? options[0]?.label ?? ''}` : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown className={cn('dk-dropdown__chevron', open && 'dk-dropdown__chevron--open')} />
      </button>

      {isFilter ? (
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="dk-dropdown__menu--filter"
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
                    'dk-dropdown__item--filter',
                    opt.value === value && 'dk-dropdown__item--filter-active',
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
          <div className="dk-dropdown__menu--default">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  'dk-dropdown__item--default',
                  opt.value === value && 'dk-dropdown__item--default-active',
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
