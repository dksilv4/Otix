import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { DkInput } from '@dk-ui/atoms/input'
import { cn } from '@/lib/utils'

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
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <DkInput
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          debouncedOnChange(e.target.value)
        }}
        placeholder={placeholder}
        className="[&>input]:pl-9 [&>input]:pr-9"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('')
            onChange('')
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export { DkSearchField, DkSearchField as SearchField }
