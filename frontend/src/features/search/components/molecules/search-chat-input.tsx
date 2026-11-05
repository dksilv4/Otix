import { useState, useRef, useEffect, forwardRef, useMemo } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import {
  MEDIA_TYPE_CLASS,
  MEDIA_TYPE_LABEL,
  MEDIA_TYPE_REGEX,
} from '../../utils/search-helpers'

export interface SearchInputProps {
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

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  value,
  onChange,
  onSubmit,
  onFocus,
  placeholder = 'Search movies, shows, games...',
  disabled = false,
  debounceMs = 200,
  showSubmitWhenEmpty = false,
  submitLabel = 'Search',
  className = '',
  onTypeChange,
  activeType,
}, ref) => {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setInputValue((current) => {
      const currentDisplay = current.replace(MEDIA_TYPE_REGEX, '').trimStart()
      if (value !== currentDisplay) {
        return value
      }
      return current
    })
  }, [value])

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
    <div className={`relative w-full ${className}`}>
      <div
        className="relative flex items-center gap-3 px-5 py-3 rounded-[2rem] backdrop-blur-xl border border-white/[0.04] transition-all duration-300 bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)] focus-within:scale-[1.01] focus-within:bg-[var(--dk-surface-glass-hover)]"
      >
        <Search className="h-5 w-5 shrink-0 text-muted-foreground/50" />

        {displayType && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 animate-[fadeIn_200ms_ease-out] ${MEDIA_TYPE_CLASS[displayType] || 'text-primary bg-primary/10 border-primary/20'}`}
          >
            {MEDIA_TYPE_LABEL[displayType] || displayType}
            <button
              onClick={handleRemoveType}
              className="rounded-full p-0.5 hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
              aria-label={`Remove ${MEDIA_TYPE_LABEL[displayType] || displayType} filter`}
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
          placeholder={displayType ? `Search ${(MEDIA_TYPE_LABEL[displayType] || displayType).toLowerCase()}...` : placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 h-12 text-base md:text-lg bg-transparent border-0 outline-none shadow-none ring-0 focus:ring-0 focus:ring-offset-0 appearance-none placeholder:text-muted-foreground/40 text-foreground"
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

SearchInput.displayName = 'SearchInput'
