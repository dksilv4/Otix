import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation, Link } from '@tanstack/react-router'
import { Search, Film, Tv, Gamepad2, Music, Star, ChevronRight, CornerDownLeft, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { motion, AnimatePresence } from 'framer-motion'
import type { MediaItemSummary } from '@media/queries/media-queries'
import {
  MEDIA_TYPE_CLASS,
  MEDIA_TYPE_LABEL,
  formatReleaseYear,
  formatRating,
} from '@/features/search/utils/search-helpers'

/** Expandable search input with autocomplete suggestions for media across all types. */
export const NavSearch = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<MediaItemSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const collapse = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setExpanded(false)
    setValue('')
    setSuggestions([])
    setIsLoading(false)
    setActiveIndex(-1)
  }, [])

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus()
    }
  }, [expanded])

  // Click outside handler
  useEffect(() => {
    if (!expanded) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        collapse()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded, collapse])

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

  // Fetch suggestions with 200ms debounce and AbortController cancellation
  useEffect(() => {
    const trimmed = value.trim()

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (!trimmed || !expanded) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    let active = true
    const controller = new AbortController()
    abortControllerRef.current = controller

    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get<MediaItemSummary[]>('/search/suggestions', {
          params: { q: trimmed, limit: 8 },
          signal: controller.signal,
        })
        if (active) {
          setSuggestions(Array.isArray(data) ? data : [])
          setActiveIndex(-1)
          setIsLoading(false)
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'CanceledError' || (err as Error)?.name === 'AbortError') {
          return
        }
        console.error('Failed to fetch suggestions', err)
        if (active) {
          setIsLoading(false)
        }
      }
    }, 200)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [value, expanded])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue(val)
    if (!val.trim()) {
      setSuggestions([])
      setIsLoading(false)
      setActiveIndex(-1)
    }
  }

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
      if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          const item = suggestions[activeIndex]
          navigate({ to: `/media/${item.mediaType}/${item.id}` as string })
          collapse()
        } else {
          submit()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        collapse()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1 < suggestions.length ? prev + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : suggestions.length - 1))
      }
    },
    [submit, collapse, activeIndex, suggestions, navigate],
  )

  const showDropdown = expanded && (suggestions.length > 0 || (value.trim().length >= 2 && !isLoading))

  return (
    <div
      ref={containerRef}
      className={
        'flex items-center overflow-visible transition-colors duration-250 ease-out rounded-full ' +
        (expanded
          ? 'w-64 sm:w-72 px-2.5 py-1.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] bg-[var(--dk-surface-glass)] border border-white/[0.04]'
          : 'w-8 h-8 justify-center')
      }
    >
      {expanded ? (
        <>
          {isLoading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 mr-1.5 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-1.5" />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="w-full bg-transparent border-0 outline-none shadow-none text-sm ring-0 focus:ring-0 focus:ring-offset-0 text-foreground placeholder:text-muted-foreground/50"
          />

          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 z-[9999] top-[calc(100%+0.5rem)] w-full max-h-[26rem] overflow-y-auto scrollbar-thin p-2 rounded-2xl flex flex-col gap-1 bg-[var(--dk-surface-overlay)]/95 backdrop-blur-2xl shadow-[var(--dk-shadow-dialog)] border border-white/[0.06]"
                role="listbox"
              >
                {suggestions.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground/70 select-none">
                      <span>Suggestions</span>
                      <span className="text-[10px] tracking-wide text-muted-foreground/50">
                        ↑↓ Navigate · ↵ Select · Esc Close
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {suggestions.map((item, idx) => {
                        const Icon =
                          item.mediaType === 'movie'
                            ? Film
                            : item.mediaType === 'show'
                            ? Tv
                            : item.mediaType === 'game'
                            ? Gamepad2
                            : Music

                        const typeName = MEDIA_TYPE_LABEL[item.mediaType] || item.mediaType
                        const year = formatReleaseYear(item.releaseDate)
                        const rating = formatRating(item.avgRating || (item as any).overallRating)
                        const badgeClass =
                          MEDIA_TYPE_CLASS[item.mediaType] || 'text-primary bg-primary/10 border-primary/20'

                        return (
                          <Link
                            key={item.id}
                            to={`/media/${item.mediaType}/${item.id}` as string}
                            onClick={() => collapse()}
                            className={
                              'group flex items-center gap-3 p-2 rounded-xl select-none text-left w-full cursor-pointer transition-colors ' +
                              (idx === activeIndex
                                ? 'bg-[var(--dk-surface-raised)] ring-1 ring-primary/40 shadow-sm'
                                : 'bg-[var(--dk-surface-raised)]/40 hover:bg-[var(--dk-surface-raised)] border border-white/[0.04]')
                            }
                            role="option"
                            aria-selected={idx === activeIndex}
                          >
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt=""
                                className="w-10 h-14 rounded-lg object-cover shrink-0 shadow-sm bg-[var(--dk-surface-ghost)] border border-white/[0.04]"
                              />
                            ) : (
                              <div className="w-10 h-14 rounded-lg flex items-center justify-center shrink-0 bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                                <Icon className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold truncate leading-snug text-foreground group-hover:text-primary transition-colors">
                                {item.title}
                              </h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeClass}`}
                                >
                                  {typeName}
                                </span>
                                {year && (
                                  <span className="text-xs text-muted-foreground/80 font-mono">
                                    {year}
                                  </span>
                                )}
                                {rating && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground/90 font-medium">
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    {rating}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition shrink-0 ml-1" />
                          </Link>
                        )
                      })}
                    </div>

                    <div className="pt-1 mt-0.5 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={submit}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-[var(--dk-surface-raised)] transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Search className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">View all results for &ldquo;{value.trim()}&rdquo;</span>
                        </span>
                        <CornerDownLeft className="w-3 h-3 text-muted-foreground shrink-0 ml-2" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center select-none flex flex-col items-center justify-center gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--dk-surface-ghost)] text-muted-foreground/60">
                      <Search className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      No matches found for &ldquo;{value.trim()}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={submit}
                      className="mt-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer"
                    >
                      Search all records &rarr;
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-full w-8 h-8 flex items-center justify-center transition-colors cursor-pointer hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]"
          aria-label="Search"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
