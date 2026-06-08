// TODO: Review this file
import { useCallback, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { TYPE_OPTIONS, SORT_OPTIONS, type SortValue } from '../molecules/search-sort-bar'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { SearchResults } from './search-results'
import './search-page.scss'

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

  // Ref to avoid stale closures when both onChange and onTypeChange fire
  const searchRef = useRef({ q, type, sort })
  searchRef.current = { q, type, sort }

  // Update URL with replace so filter changes don't pollute history.
  // Mutates the ref immediately to prevent stale closures when both onChange
  // and onTypeChange fire synchronously in the same debounce callback.
  const updateSearch = useCallback(
    (updates: Partial<SearchRouteParams>) => {
      const next = { ...searchRef.current, ...updates }
      searchRef.current = next
      navigate({
        to: '/search',
        search: next,
        replace: true,
      })
    },
    [navigate],
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
    <div className="dk-discover-search-page">
      <Helmet>
        <title>{q ? `"${q}" - Search - Otix` : 'Search - Otix'}</title>
        <meta name="description" content={q ? `Search results for "${q}" on Otix — find movies, shows, games, and music.` : 'Search Otix for movies, shows, game, and music.'} />
        <meta property="og:title" content={q ? `"${q}" - Search - Otix` : 'Search - Otix'} />
        <meta property="og:description" content={q ? `Search results for "${q}" on Otix.` : 'Find your next obsession on Otix.'} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>
      <div className="dk-discover-search-page__content">
        <div className="dk-discover-search-page__hero">
          <div className="dk-discover-search-page__search">
            <ChatSearchInput
              ref={inputRef}
              value={q}
              onChange={(val) => updateSearch({ q: val })}
              onTypeChange={(t) => updateSearch({ type: t || 'all' })}
              activeType={type === 'all' ? null : type}
              placeholder={placeholder}
              debounceMs={150}
            />
            <div className="dk-discover-search-page__filters">
              <DkDropdown
                variant="filter"
                label="Type"
                options={TYPE_OPTIONS}
                value={type === 'all' ? '' : type}
                onChange={(v) => updateSearch({ type: v || 'all' })}
              />
              <DkDropdown
                variant="filter"
                label="Sort"
                options={SORT_OPTIONS}
                value={sort as SortValue}
                onChange={(v) => updateSearch({ sort: v })}
              />
            </div>
          </div>
        </div>

        {isSearching && (
          <div className="dk-discover-search-page__results">
            <SearchResults query={q} type={type} sortBy={sort as SortValue} />
          </div>
        )}
      </div>
    </div>
  )
}
