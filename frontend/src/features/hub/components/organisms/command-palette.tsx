import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, CornerDownLeft } from 'lucide-react'
import { CommandItem } from '../molecules/command-item'
import { type CommandGroup, searchAllProviders } from '../../utils'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

const SEARCH_DEBOUNCE_MS = 150

/**
 * Overlay shell. Keeps AnimatePresence mounted so exit animations play; the
 * inner panel is mounted only while open, so its state resets on every open.
 */
export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <CommandPalettePanel onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  )
};

const CommandPalettePanel = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const flatCommands = useMemo(() => groups.flatMap((g) => g.commands), [groups])

  // Auto-focus on open (panel remounts each time it opens)
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Debounced search across registered providers
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const next = await searchAllProviders(query.trim())
        if (!cancelled) {
          setGroups(next)
          setActiveIndex(0)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, query.trim() ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  // Keep the active row visible while navigating
  useEffect(() => {
    const active = flatCommands[activeIndex]
    if (!active) return
    itemRefs.current.get(active.id)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, flatCommands])

  const runActive = () => {
    const command = flatCommands[activeIndex]
    if (!command) return
    command.run()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatCommands.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runActive()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let offset = 0

  return (
    <motion.div
      className="relative w-full max-w-[640px] overflow-hidden rounded-2xl shadow-[var(--dk-shadow-dialog)] border border-[var(--dk-separator)] backdrop-blur-2xl"
      style={{ backgroundColor: 'var(--dk-surface-overlay)' }}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      onKeyDown={handleKeyDown}
    >
      {/* Input */}
      <div className="flex items-center gap-3 border-b border-[var(--dk-separator)] px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search games, movies, shows, music…"
          aria-label="Search command palette"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <kbd className="shrink-0 rounded border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-1.5 py-0.5 text-[10px] text-muted-foreground">
          esc
        </kbd>
      </div>

      {/* Results */}
      <div className="max-h-[50vh] overflow-y-auto py-2">
        {isLoading && flatCommands.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
        ) : flatCommands.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {query.trim() ? `No results for “${query.trim()}”` : 'Type to search'}
          </p>
        ) : (
          (Array.isArray(groups) ? groups : []).map((group) => {
            const start = offset
            offset += group.commands.length
            return (
              <div key={group.providerId}>
                <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
                {(Array.isArray(group.commands) ? group.commands : []).map((command, i) => {
                  const flatIndex = start + i
                  return (
                    <CommandItem
                      key={command.id}
                      command={command}
                      active={flatIndex === activeIndex}
                      onHover={() => setActiveIndex(flatIndex)}
                      onSelect={() => {
                        command.run()
                        onClose()
                      }}
                      innerRef={(el) => {
                        if (el) itemRefs.current.set(command.id, el)
                        else itemRefs.current.delete(command.id)
                      }}
                    />
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-end gap-4 border-t border-[var(--dk-separator)] px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-1">↑</kbd>
          <kbd className="rounded border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] px-1">↓</kbd>
          <span>navigate</span>
        </span>
        <span className="flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" />
          <span>open</span>
        </span>
      </div>
    </motion.div>
  )
};
