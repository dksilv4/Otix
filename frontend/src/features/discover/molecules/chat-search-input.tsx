import { useState, useRef, useEffect, forwardRef, useMemo } from 'react'
import { ArrowRight, Dumbbell, Sparkles, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModeDef {
  id: string
  label: string
  icon: LucideIcon
}

const MODES: ModeDef[] = [
  { id: 'discover', label: 'Discover', icon: Sparkles },
  { id: 'workout', label: 'Workout', icon: Dumbbell },
]

const MEDIA_TYPE_REGEX = /^\/(movie|show|game|music)\b/

const MEDIA_TYPE_LABEL: Record<string, string> = {
  movie: 'Movie',
  show: 'TV Show',
  game: 'Game',
  music: 'Music',
}

const MEDIA_TYPE_COLOR: Record<string, string> = {
  movie: 'text-rose-400 bg-rose-400/10 border-rose-400/20 hover:bg-rose-400/20',
  show: 'text-violet-400 bg-violet-400/10 border-violet-400/20 hover:bg-violet-400/20',
  game: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 hover:bg-emerald-400/20',
  music: 'text-amber-400 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20',
}

interface ChatSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  onFocus?: () => void
  placeholder?: string
  disabled?: boolean
  debounceMs?: number
  leadingIcon?: LucideIcon
  showSubmitWhenEmpty?: boolean
  submitLabel?: string
  className?: string
  activeMode?: string
  onModeChange?: (modeId: string) => void
  /** Called when a /:mediaType tag is parsed from the input */
  onTypeChange?: (type: string | null) => void
  /** Current media type filter from the parent (dropdown/tabs). Shown as a tag when no /:mediaType is typed. */
  activeType?: string | null
}

export const ChatSearchInput = forwardRef<HTMLInputElement, ChatSearchInputProps>(function ChatSearchInput({
  value,
  onChange,
  onSubmit,
  onFocus,
  placeholder = "What are you in the mood for?",
  disabled = false,
  debounceMs = 300,
  leadingIcon,
  showSubmitWhenEmpty = false,
  submitLabel = 'Search',
  className,
  activeMode = 'discover',
  onModeChange,
  onTypeChange,
  activeType,
}, ref) {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sync external value changes, but preserve local /:mediaType prefix
  // when parent echoes back the cleaned query (so the tag doesn't flicker)
  useEffect(() => {
    const currentDisplay = inputValue.replace(MEDIA_TYPE_REGEX, '').trimStart()
    if (value !== currentDisplay) {
      setInputValue(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Parse media type tag from input
  const parsedType = useMemo(() => {
    const match = inputValue.match(MEDIA_TYPE_REGEX)
    return match ? match[1] : null
  }, [inputValue])

  // Resolved type: local input parsing takes precedence over parent's activeType
  const displayType = parsedType || activeType || null

  // Display value with the /:mediaType prefix stripped
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
    // If the user cleared the input, drop the prefix too so they can type a
    // new tag or do a plain search from a clean slate.
    if (parsedType && newDisplayValue.length > 0) {
      handleChange(`/${parsedType} ${newDisplayValue}`)
    } else {
      handleChange(newDisplayValue)
    }
  }

  const activeModeDef = MODES.find((m) => m.id === activeMode)
  const ResolvedIcon = leadingIcon ?? activeModeDef?.icon ?? Sparkles

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
          <ResolvedIcon className="h-5 w-5 shrink-0 text-primary/50" />

          {/* Media type tag */}
          {displayType && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0',
                'animate-in fade-in slide-in-from-left-2 duration-200',
                MEDIA_TYPE_COLOR[displayType],
              )}
            >
              {MEDIA_TYPE_LABEL[displayType]}
              <button
                onClick={handleRemoveType}
                className="rounded-full p-0.5 hover:bg-white/10 transition-colors"
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
              onClick={inputValue ? flushAndSubmit : (onSubmit || handleClear)}
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
          {MODES.map((mode) => {
            const isActive = mode.id === activeMode
            return (
              <button
                key={mode.id}
                onClick={() => onModeChange?.(mode.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                  'transition-all duration-200',
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                    : 'bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                <mode.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {mode.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
})
