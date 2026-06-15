import { useState, useRef, useEffect, forwardRef, useMemo } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MEDIA_TYPE_REGEX = /^\/(movie|show|game|music)\b/

const MEDIA_TYPE_LABEL: Record<string, string> = {
  movie: 'Movie',
  show: 'TV Show',
  game: 'Game',
  music: 'Music',
  people: 'Artist',
  users: 'User',
}

const MEDIA_TYPE_CLASS: Record<string, string> = {
  movie: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  show: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  game: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  music: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  people: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  users: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  onFocus?: () => void
  placeholder?: string
  disabled?: boolean
  debounceMs?: number
  showSubmitWhenEmpty?: boolean
  submitLabel?: string
  className?: string
  onTypeChange?: (type: string | null) => void
  activeType?: string | null
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({
  value,
  onChange,
  onSubmit,
  onFocus,
  placeholder = 'Search movies, shows, games, music...',
  disabled = false,
  debounceMs = 300,
  showSubmitWhenEmpty = false,
  submitLabel = 'Search',
  className,
  onTypeChange,
  activeType,
}, ref) {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const currentDisplay = inputValue.replace(MEDIA_TYPE_REGEX, '').trimStart()
    if (value !== currentDisplay) {
      setInputValue(value)
    }
  }, [value, inputValue])

  const parsedType = useMemo(() => {
    const match = inputValue.match(MEDIA_TYPE_REGEX)
    return match ? match[1] : null
  }, [inputValue])

  const displayType = parsedType || activeType || null

  const displayValue = useMemo(() => {
    return inputValue.replace(MEDIA_TYPE_REGEX, '').trimStart()
  }, [inputValue])

  const handleChange = (val: string) => {
    setInputValue(val)
    clearTimeout(timerRef.current)

    const match = val.match(MEDIA_TYPE_REGEX)
    const newType = match ? match[1] : null
    const cleanVal = val.replace(MEDIA_TYPE_REGEX, '').trimStart()

    if (debounceMs <= 0) {
      onChange(cleanVal)
      onTypeChange?.(newType)
      return
    }
    timerRef.current = setTimeout(() => {
      onChange(cleanVal)
      onTypeChange?.(newType)
    }, debounceMs)
  }

  const handleClear = () => {
    setInputValue('')
    clearTimeout(timerRef.current)
    onChange('')
    onTypeChange?.(null)
  }

  const handleRemoveType = () => {
    if (parsedType) {
      const newVal = inputValue.replace(MEDIA_TYPE_REGEX, '').trimStart()
      setInputValue(newVal)
      clearTimeout(timerRef.current)
      onChange(newVal)
    }
    onTypeChange?.(null)
  }

  const flushAndSubmit = () => {
    clearTimeout(timerRef.current)
    onChange(displayValue)
    onTypeChange?.(parsedType)
    if (onSubmit) onSubmit()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (onSubmit) flushAndSubmit()
    } else if (e.key === 'Backspace' && displayValue === '' && parsedType) {
      handleRemoveType()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDisplayValue = e.target.value
    if (parsedType && newDisplayValue.length > 0) {
      handleChange(`/${parsedType} ${newDisplayValue}`)
    } else {
      handleChange(newDisplayValue)
    }
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div
        className={cn(
          'relative flex items-center gap-3 px-5 py-3',
          'rounded-[2rem] backdrop-blur-xl ring-1 ring-white/[0.04] transition-all duration-300',
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
          'shadow-[var(--dk-shadow-glass)]',
          'focus-within:scale-[1.01] focus-within:ring-primary/20',
        )}
      >
        <Search className="h-5 w-5 shrink-0 text-muted-foreground/50" />

        {displayType && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 animate-[fadeIn_200ms_ease-out]',
              MEDIA_TYPE_CLASS[displayType],
            )}
          >
            {MEDIA_TYPE_LABEL[displayType]}
            <button
              onClick={handleRemoveType}
              className="rounded-full p-0.5 hover:bg-white/[0.1] transition-colors"
              aria-label={`Remove ${MEDIA_TYPE_LABEL[displayType]} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        <input
          ref={ref}
          value={displayValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder={displayType ? `Search ${MEDIA_TYPE_LABEL[displayType].toLowerCase()}...` : placeholder}
          disabled={disabled}
          className={cn(
            'flex-1 min-w-0 h-12 text-base md:text-lg',
            'bg-transparent border-0 outline-none shadow-none ring-0 focus:ring-0 focus:ring-offset-0',
            'appearance-none placeholder:text-muted-foreground/40 text-foreground',
          )}
        />
        {(inputValue || showSubmitWhenEmpty) && (
          <button
            onClick={inputValue ? flushAndSubmit : (onSubmit || handleClear)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 hover:scale-105 active:scale-95 transition-all"
            aria-label={submitLabel}
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
})
