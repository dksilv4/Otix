import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
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

const DkDropdownInner = <T extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className,
  variant = 'default',
  label,
  align = 'left',
}: DkDropdownProps<T>) => {
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

  useLayoutEffect(() => {
    if (open) updateCoords()
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    // Close on scroll instead of repositioning — avoids jank while the page
    // infinite-scrolls or the layout shifts under an open menu.
    const handleScroll = () => {
      setOpen(false)
    }

    const handleResize = () => {
      updateCoords()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
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
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={
          isFilter
            ? cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer select-none',
                value
                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                  : 'bg-[var(--dk-surface-ghost)] text-foreground/80 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
              )
            : cn(
                'flex items-center justify-between gap-2.5 rounded-xl px-3.5 h-9.5 text-xs font-medium w-full transition-colors duration-150 text-left cursor-pointer select-none',
                open
                  ? 'bg-[var(--dk-surface-ghost-active)] text-foreground font-semibold'
                  : 'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)] text-foreground/80 hover:text-foreground',
              )
        }
      >
        <span className={cn('truncate', !isFilter && !selected && 'text-muted-foreground')}>
          {isFilter
            ? `${label ? `${label}: ` : ''}${selected?.label ?? options[0]?.label ?? ''}`
            : (selected?.label ?? placeholder)}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed p-1 rounded-2xl z-[99999] max-h-60 overflow-y-auto scrollbar-none"
            style={{
              top: coords.top,
              ...(coords.left !== undefined ? { left: coords.left } : {}),
              ...(coords.right !== undefined ? { right: coords.right } : {}),
              minWidth: isFilter ? 170 : Math.max(coords.width, 180),
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px var(--dk-separator)',
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value as T)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-left cursor-pointer',
                    isSelected
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'text-foreground/80 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
};

export const DkDropdown = memo(DkDropdownInner) as typeof DkDropdownInner
