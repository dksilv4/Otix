import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
] as const

export const SORT_OPTIONS = [
  { value: '', label: 'Relevance' },
  { value: 'popularity', label: 'Popular' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'release_date', label: 'Newest' },
  { value: 'title', label: 'A–Z' },
] as const

export type TypeValue = (typeof TYPE_OPTIONS)[number]['value']
export type SortValue = (typeof SORT_OPTIONS)[number]['value']

interface SearchSortBarProps {
  typeValue: TypeValue
  onTypeChange: (value: TypeValue) => void
  sortValue: SortValue
  onSortChange: (value: SortValue) => void
  resultCount?: number
  className?: string
}

export function FilterDropdown<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  const activeLabel = options.find((o) => o.value === value)?.label ?? options[0].label

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
          'transition-all duration-200',
          value
            ? 'bg-primary/15 text-primary'
            : 'bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.08]',
        )}
      >
        {label}: {activeLabel}
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute top-full mt-2 z-50',
              'min-w-[160px] p-2 rounded-[1.25rem]',
              'bg-[var(--dk-surface-overlay)]',
              'backdrop-blur-xl',
              'shadow-[var(--dk-shadow-glass)]',
              'ring-1 ring-white/[0.06]',
            )}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl text-sm font-medium',
                  'transition-colors duration-150',
                  opt.value === value
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function SearchSortBar({
  typeValue,
  onTypeChange,
  sortValue,
  onSortChange,
  resultCount,
  className,
}: SearchSortBarProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2">
        <FilterDropdown label="Type" options={TYPE_OPTIONS} value={typeValue} onChange={onTypeChange} />
        <FilterDropdown label="Sort" options={SORT_OPTIONS} value={sortValue} onChange={onSortChange} />
      </div>
      {resultCount !== undefined && (
        <span className="text-xs text-muted-foreground shrink-0">
          {resultCount.toLocaleString()} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
