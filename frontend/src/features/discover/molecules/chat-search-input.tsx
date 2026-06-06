// TODO: Review this file
import { useState, useRef, useEffect, forwardRef, useMemo } from 'react'
import { ArrowRight, Dumbbell, Sparkles, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import './chat-search-input.scss'

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
  people: 'Artist',
  users: 'User',
}

const MEDIA_TYPE_CLASS: Record<string, string> = {
  movie: 'dk-discover-chat-input__tag--movie',
  show: 'dk-discover-chat-input__tag--show',
  game: 'dk-discover-chat-input__tag--game',
  music: 'dk-discover-chat-input__tag--music',
  people: 'dk-discover-chat-input__tag--people',
  users: 'dk-discover-chat-input__tag--users',
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
    <div className={cn('dk-discover-chat-input', className)}>
      <div className="dk-discover-chat-input__card">
        {/* Input row */}
        <div className="dk-discover-chat-input__input-row">
          <ResolvedIcon className="h-5 w-5 shrink-0 text-primary/50" />

          {/* Media type tag */}
          {displayType && (
            <span
              className={cn(
                'dk-discover-chat-input__tag',
                MEDIA_TYPE_CLASS[displayType],
              )}
            >
              {MEDIA_TYPE_LABEL[displayType]}
              <button
                onClick={handleRemoveType}
                className="dk-discover-chat-input__tag-remove"
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
              'dk-discover-chat-input__input',
            )}
          />
          {(inputValue || showSubmitWhenEmpty) && (
            <button
              onClick={inputValue ? flushAndSubmit : (onSubmit || handleClear)}
              className="dk-discover-chat-input__submit"
              aria-label={submitLabel}
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Tools row */}
        <div className="dk-discover-chat-input__tools">
          {MODES.map((mode) => {
            const isActive = mode.id === activeMode
            return (
              <button
                key={mode.id}
                onClick={() => onModeChange?.(mode.id)}
                className={cn(
                  'dk-discover-chat-input__mode-btn',
                  isActive && 'dk-discover-chat-input__mode-btn--active',
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
