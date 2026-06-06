import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { DkInput } from '@dk-ui/atoms/input'
import { cn } from '@/lib/utils'
import './search-field.scss'

interface DkSearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

function DkSearchField({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: DkSearchFieldProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const debouncedOnChange = useCallback(
    (val: string) => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(val), debounceMs)
    },
    [onChange, debounceMs],
  )

  return (
    <div className={cn('dk-search-field', className)}>
      <Search className="dk-search-field__icon" />
      <DkInput
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          debouncedOnChange(e.target.value)
        }}
        placeholder={placeholder}
        className="dk-search-field__input"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('')
            onChange('')
          }}
          className="dk-search-field__clear"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export { DkSearchField, DkSearchField as SearchField }
