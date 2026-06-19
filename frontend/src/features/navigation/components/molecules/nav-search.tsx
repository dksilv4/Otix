
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation, Link } from '@tanstack/react-router'
import { Search, Film, Tv, Gamepad2, Music } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { motion, AnimatePresence } from 'framer-motion'
import type { MediaItemSummary } from '@media/queries/media-queries'

/** Expandable search input with autocomplete suggestions for media across all types. */
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

 return (
 <div
 ref={containerRef}
 className={'flex items-center relative transition-all duration-300 rounded-full ' + (expanded ? 'w-64 px-2.5 py-1.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px]' : 'w-8 h-8 justify-center') + (expanded ? ' bg-[var(--dk-surface-glass)] bg-gradient-to-r from-transparent via-indigo-500/[0.04] to-transparent' : '')}
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
 className="w-full bg-transparent border-0 outline-none shadow-none text-sm ring-0 focus:ring-0 focus:ring-offset-0 text-foreground placeholder:text-muted-foreground/50"
 />

 <AnimatePresence>
 {suggestions.length > 0 && (
 <motion.div
 initial={{ opacity: 0, y: -8, scale: 0.96 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: -8, scale: 0.96 }}
 transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
 className="absolute right-0 z-[9999] top-[calc(100%+0.75rem)] w-80 max-h-[22rem] overflow-y-auto p-2 rounded-2xl flex flex-col gap-0.5 bg-[var(--dk-surface-overlay)] backdrop-blur-[20px] shadow-[var(--dk-shadow-glass)]"
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

	 const badgeClass = item.mediaType === 'movie'
	   ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
	   : item.mediaType === 'show'
	   ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/10'
	   : item.mediaType === 'game'
	   ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
	   : 'bg-purple-500/10 text-purple-400 border-purple-500/10'

 return (
 <Link
 key={item.id}
  
 to={`/media/${item.mediaType}/${item.id}` as string}
 onClick={() => collapse()}
 className={'flex items-center gap-3 p-2 rounded-xl select-none text-left w-full cursor-pointer transition-all duration-150 hover:bg-white/5' + (idx === activeIndex ? ' bg-white/[0.08] scale-[1.01]' : '')}
 role="option"
 aria-selected={idx === activeIndex}
 >
 {item.posterUrl ? (
 <img
 src={item.posterUrl}
 alt=""
 className="w-9 h-12 rounded object-cover shrink-0 shadow-md bg-white/5"
 />
 ) : (
 <div className="w-9 h-12 rounded flex items-center justify-center shrink-0 bg-white/5">
 <Icon className="w-5 h-5 text-muted-foreground" />
 </div>
 )}
 <div className="min-w-0 flex-1">
 <h4 className="text-sm font-semibold truncate leading-tight text-foreground">
 {item.title}
 </h4>
 <div className="flex items-center gap-1.5 mt-1">
 <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeClass}`}>
 {typeName}
 </span>
 {year && (
 <span className="text-xs text-muted-foreground/60">
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
 className="rounded-full w-8 h-8 flex items-center justify-center transition-colors cursor-pointer hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]"
 aria-label="Search"
 >
 <Search className="h-4 w-4 text-muted-foreground" />
 </button>
 )}
 </div>
 )
}
