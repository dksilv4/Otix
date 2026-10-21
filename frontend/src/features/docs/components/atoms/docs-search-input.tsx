import { useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface DocsSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export const DocsSearchInput = ({
  value,
  onChange,
  placeholder = 'Search docs (Press "/" to focus)...',
  className = '',
}: DocsSearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 rounded-xl text-xs sm:text-sm bg-[var(--dk-surface-field)] text-foreground placeholder:text-muted-foreground/60 border border-[var(--dk-separator)] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-150"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="absolute right-3 hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-muted-foreground/60 bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
          /
        </span>
      )}
    </div>
  )
}
