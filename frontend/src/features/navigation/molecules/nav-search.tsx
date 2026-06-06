import './nav-search.scss'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation, Link } from '@tanstack/react-router'
import { Search, Film, Tv, Gamepad2, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { motion, AnimatePresence } from 'framer-motion'
import type { MediaItemSummary } from '@/features/media/media-queries'

export function NavSearch() {
 const navigate = useNavigate()
 const location = useLocation()
 const [expanded, setExpanded] = useState(false)
 const [value, setValue] = useState('')
 const [suggestions, setSuggestions] = useState<MediaItemSummary[]>([])
 const [activeIndex, setActiveIndex] = useState(-1)

 const containerRef = useRef<HTMLDivElement>(null)
 const inputRef = useRef<HTMLInputElement>(null)

 const collapse = useCallback(() => {
 setExpanded(false)
 setValue('')
 setSuggestions([])
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

 // Fetch suggestions with 200ms debounce
 useEffect(() => {
 const trimmed = value.trim()
 if (!trimmed || !expanded) {
 // NOTE: We do NOT call setSuggestions([]) synchronously here to avoid triggering ESLint set-state-in-effect warning.
 // suggestions/activeIndex are cleared inside handleInputChange and collapse.
 return
 }

 const timer = setTimeout(async () => {
 try {
 const { data } = await apiClient.get<MediaItemSummary[]>('/media/suggestions', {
 params: { q: trimmed, limit: 8 }
 })
 setSuggestions(data)
 setActiveIndex(-1)
 } catch (err) {
 console.error('Failed to fetch suggestions', err)
 }
 }, 200)

 return () => clearTimeout(timer)
 }, [value, expanded])

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const val = e.target.value
 setValue(val)
 if (!val.trim()) {
 setSuggestions([])
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
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 navigate({ to: `/media/${item.mediaType}/${item.id}` as any })
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

 return (
 <div
 ref={containerRef}
 className={cn(
  'dk-nav-search',
  expanded ? 'dk-nav-search--expanded' : 'dk-nav-search--collapsed',
 )}
 >
 {expanded ? (
 <>
 <Search className="h-4 w-4 text-muted-foreground shrink-0 mr-1.5" />
 <input
 ref={inputRef}
 value={value}
 onChange={handleInputChange}
 onKeyDown={handleKeyDown}
 placeholder="Search..."
 className="dk-nav-search__input"
 />

 <AnimatePresence>
 {suggestions.length > 0 && (
 <motion.div
 initial={{ opacity: 0, y: -8, scale: 0.96 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -8, scale: 0.96 }}
 transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
 className="dk-nav-search__dropdown"
 role="listbox"
 >
 {suggestions.map((item, idx) => {
 const Icon = item.mediaType === 'movie'
 ? Film
 : item.mediaType === 'show'
 ? Tv
 : item.mediaType === 'game'
 ? Gamepad2
 : Music

 const typeName = item.mediaType === 'movie'
 ? 'Movie'
 : item.mediaType === 'show'
 ? 'Show'
 : item.mediaType === 'game'
 ? 'Game'
 : 'Music'

 const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null

 return (
 <Link
 key={item.id}
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 to={`/media/${item.mediaType}/${item.id}` as any}
 onClick={() => collapse()}
 className={cn(
  'dk-nav-search__item',
  idx === activeIndex && 'dk-nav-search__item--active',
 )}
 role="option"
 aria-selected={idx === activeIndex}
 >
 {item.posterUrl ? (
 <img
 src={item.posterUrl}
 alt=""
 className="dk-nav-search__poster"
 />
 ) : (
 <div className="dk-nav-search__poster-placeholder">
 <Icon className="w-5 h-5 text-muted-foreground" />
 </div>
 )}
 <div className="dk-nav-search__info">
 <h4 className="dk-nav-search__title">
 {item.title}
 </h4>
 <div className="flex items-center gap-1.5 mt-1">
 <span className={cn('dk-nav-search__badge', `dk-nav-search__badge--${item.mediaType}`)}>
 {typeName}
 </span>
 {year && (
 <span className="dk-nav-search__year">
 &middot; {year}
 </span>
 )}
 </div>
 </div>
 </Link>
 )
 })}
 </motion.div>
 )}
 </AnimatePresence>
 </>
 ) : (
 <button
 onClick={() => setExpanded(true)}
 className="dk-nav-search__trigger"
 aria-label="Search"
 >
 <Search className="h-4 w-4 text-muted-foreground" />
 </button>
 )}
 </div>
 )
}
