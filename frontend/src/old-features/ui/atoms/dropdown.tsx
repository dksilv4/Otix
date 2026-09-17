import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
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
  align?: 'left' | 'right'
}

export function DkDropdown<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className,
  variant = 'default',
  label,
  align = 'left',
}: DkDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number; width: number }>({
    top: 0,
    width: 0,
  })

  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    if (align === 'right') {
      setCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
        width: rect.width,
      })
    } else {
      setCoords({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      })
    }
  }, [align])

  useEffect(() => {
    if (open) {
      updateCoords()
    }
  }, [open, updateCoords])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    function handleScrollOrResize() {
      if (open) {
        updateCoords()
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('scroll', handleScrollOrResize, true)
      window.addEventListener('resize', handleScrollOrResize)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open, updateCoords])

  const selected = options.find((o) => o.value === value)
  const isFilter = variant === 'filter'

  return (
    <div className={cn('relative', !isFilter && 'w-full', !isFilter && label && 'space-y-1', className)}>
      {!isFilter && label ? (
        <label htmlFor={triggerId} className="block pl-4 text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <button
        ref={buttonRef}
        id={!isFilter && label ? triggerId : undefined}
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isFilter
            ? cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer select-none',
                value
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/10 active:scale-[0.98]',
              )
            : cn(
                'flex items-center justify-between gap-2.5 rounded-xl px-3.5 h-9.5 text-xs font-medium w-full transition-all duration-200 text-left cursor-pointer select-none',
                open
                  ? 'bg-white/10 text-white font-semibold'
                  : 'bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/80 hover:text-white',
              )
        }
      >
        <span className={cn('truncate', !isFilter && !selected && 'text-white/40')}>
          {isFilter
            ? `${label ? `${label}: ` : ''}${selected?.label ?? options[0]?.label ?? ''}`
            : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-white/50 shrink-0 transition-transform duration-200',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {/* Render Dropdown Floating Menu via Portal into document.body */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="fixed p-1 rounded-2xl z-[99999] shadow-2xl backdrop-blur-2xl max-h-60 overflow-y-auto scrollbar-none"
                style={{
                  top: `${coords.top}px`,
                  ...(coords.left !== undefined ? { left: `${coords.left}px` } : {}),
                  ...(coords.right !== undefined ? { right: `${coords.right}px` } : {}),
                  minWidth: isFilter ? '170px' : `${Math.max(coords.width, 180)}px`,
                  backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.85)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75), 0 0 1px rgba(255, 255, 255, 0.1)',
                }}
              >
                {options.map((opt) => {
                  const isSelected = opt.value === value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value as T)
                        setOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 text-left cursor-pointer',
                        isSelected
                          ? 'bg-primary/20 text-primary font-semibold'
                          : 'text-white/70 hover:text-white hover:bg-white/10',
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
