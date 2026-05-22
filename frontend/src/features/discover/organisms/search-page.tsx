import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { FilterDropdown, TYPE_OPTIONS, SORT_OPTIONS, type SortValue } from '../molecules/search-sort-bar'
import { SearchResults } from './search-results'

export interface SearchRouteParams {
  q: string
  type: string
  sort: string
}

const PLACEHOLDERS = [
  'Find your next obsession...',
  'Cue up a cozy night pick...',
  'Chase a new gaming rabbit hole...',
  'What vibe are we on today?',
]

export function SearchPage() {
  const { q, type, sort } = useSearch({ from: '/search' }) as SearchRouteParams
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])

  const isSearching = q.length > 0

  // Update URL with replace so filter changes don't pollute history
  const updateSearch = useCallback(
    (updates: Partial<SearchRouteParams>) => {
      navigate({
        to: '/search',
        search: { q, type, sort, ...updates },
        replace: true,
      })
    },
    [navigate, q, type, sort],
  )

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape' && target === inputRef.current) {
          updateSearch({ q: '' })
          ;(target as HTMLInputElement).blur()
        }
        return
      }

      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    },
    [updateSearch],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="relative min-h-[calc(100vh-5rem)]">
      <div className="flex flex-col items-center px-4 pb-16 w-full">
        <div className="min-h-[25vh] flex flex-col justify-center items-center w-full gap-6">
          <div className="w-full max-w-3xl flex flex-col items-center">
            <ChatSearchInput
              ref={inputRef}
              value={q}
              onChange={(val) => updateSearch({ q: val })}
              placeholder={placeholder}
              debounceMs={150}
            />
            <div className="flex items-center gap-2 mt-4">
              <FilterDropdown
                label="Type"
                options={TYPE_OPTIONS}
                value={type === 'all' ? '' : type}
                onChange={(v) => updateSearch({ type: v || 'all' })}
              />
              <FilterDropdown
                label="Sort"
                options={SORT_OPTIONS}
                value={sort as SortValue}
                onChange={(v) => updateSearch({ sort: v })}
              />
            </div>
          </div>
        </div>

        {isSearching && (
          <div className="w-full max-w-[1400px] mt-6">
            <SearchResults query={q} type={type} sortBy={sort as SortValue} />
          </div>
        )}
      </div>
    </div>
  )
}
