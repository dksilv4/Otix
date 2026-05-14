import { useState, useRef, useEffect, forwardRef } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const MODES = [
  { id: 'discover', label: 'Discover' },
] as const

interface ChatSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  disabled?: boolean
  debounceMs?: number
  leadingIcon?: LucideIcon
  modeLabel?: string
  showSubmitWhenEmpty?: boolean
  submitLabel?: string
  className?: string
}

export const ChatSearchInput = forwardRef<HTMLInputElement, ChatSearchInputProps>(function ChatSearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "What are you in the mood for?",
  disabled = false,
  debounceMs = 300,
  leadingIcon: LeadingIcon = Sparkles,
  modeLabel = 'Discover',
  showSubmitWhenEmpty = false,
  submitLabel = 'Search',
  className,
}, ref) {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sync external value changes to internal state
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleChange = (val: string) => {
    setInputValue(val)
    clearTimeout(timerRef.current)
    if (debounceMs <= 0) {
      onChange(val)
      return
    }
    timerRef.current = setTimeout(() => onChange(val), debounceMs)
  }

  const handleClear = () => {
    setInputValue('')
    clearTimeout(timerRef.current)
    onChange('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) onSubmit()
  }

  return (
    <div className={cn('relative w-full max-w-3xl', className)}>
      <div
        className={cn(
          'relative rounded-[2rem]',
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
          'backdrop-blur-xl shadow-[var(--dk-shadow-glass)]',
          'ring-1 ring-white/[0.04]',
          'transition-all duration-300',
          'focus-within:scale-[1.01] focus-within:ring-primary/20',
        )}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-2">
          <LeadingIcon className="h-5 w-5 shrink-0 text-primary/50" />
          <input
            ref={ref}
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'flex-1 min-w-0 h-12 md:h-14',
              'text-lg md:text-xl',
              'bg-transparent border-0 outline-none',
              'shadow-none ring-0 focus:ring-0 focus:ring-offset-0',
              'appearance-none',
              'placeholder:text-muted-foreground/40',
              'text-foreground',
            )}
          />
          {(inputValue || showSubmitWhenEmpty) && (
            <button
              onClick={onSubmit || handleClear}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                'bg-primary/20 text-primary',
                'hover:bg-primary/30 hover:scale-105',
                'active:scale-95',
                'transition-all duration-200',
              )}
              aria-label={submitLabel}
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Tools row */}
        <div className="flex items-center gap-2 px-5 pb-4">
          {MODES.map(() => (
            <button
              key={modeLabel}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium',
                'transition-all duration-200',
                'bg-primary/15 text-primary',
              )}
            >
              {modeLabel}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
