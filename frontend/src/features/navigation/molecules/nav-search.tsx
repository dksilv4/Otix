import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function NavSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const collapse = useCallback(() => {
    setExpanded(false)
    setValue('')
  }, [])

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus()
    }
  }, [expanded])

  // Global keyboard shortcut to expand search (skip on home page which has its own)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        if (location.pathname === '/') return
        setExpanded(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname])

  const submit = useCallback(() => {
    const q = value.trim()
    if (!q) {
      collapse()
      return
    }
    navigate({ to: '/search', search: { q, type: 'all', sort: '' } })
    collapse()
  }, [value, navigate, collapse])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') submit()
      if (e.key === 'Escape') collapse()
    },
    [submit, collapse],
  )

  return (
    <div
      className={cn(
        'flex items-center rounded-[2rem] transition-all duration-300',
        'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
        'backdrop-blur-lg shadow-[var(--dk-shadow-glass)]',
        expanded ? 'w-64 px-3 py-1.5' : 'w-9 h-9 justify-center',
      )}
    >
      {expanded ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (!value.trim()) collapse()
          }}
          placeholder="Search..."
          className={cn(
            'w-full bg-transparent border-0 outline-none',
            'shadow-none ring-0 focus:ring-0 focus:ring-offset-0',
            'text-sm text-foreground placeholder:text-muted-foreground/50',
          )}
        />
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-full w-9 h-9 flex items-center justify-center hover:bg-white/[0.06] transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
