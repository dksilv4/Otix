import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Unlink, Search, Gamepad2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DkButton } from '@ui/atoms/button'
import { getSupportedOtixGames, getPresetIconUrl } from '../utils/presets'
import type { SupportedOtixGameOption } from '../utils/presets'

interface OtixGameLinkerProps {
  linkedMediaId: string | null
  linkedGameTitle: string
  isInitialLinked: boolean
  onLinkGame: (otixGameId: string, gameTitle: string) => void
  onUnlinkGame: () => void
}

export const OtixGameLinker = ({
  linkedMediaId,
  linkedGameTitle,
  isInitialLinked,
  onLinkGame,
  onUnlinkGame,
}: OtixGameLinkerProps) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  })

  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = 320

    const top =
      spaceBelow < dropdownHeight && rect.top > dropdownHeight
        ? rect.top - dropdownHeight - 6
        : rect.bottom + 6

    setCoords({
      top,
      left: rect.left,
      width: Math.max(rect.width, 280),
    })
  }, [])

  useLayoutEffect(() => {
    if (open) {
      updateCoords()
    }
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }

    const timer = setTimeout(() => searchInputRef.current?.focus(), 50)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }

    const handleResize = () => updateCoords()

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, updateCoords])

  const supportedGames = getSupportedOtixGames()
  const normalizedQuery = search.toLowerCase().trim()
  const filteredGames = supportedGames.filter((g) => {
    if (!normalizedQuery) return true
    return (
      g.gameTitle.toLowerCase().includes(normalizedQuery) ||
      g.otixGameId.toLowerCase().includes(normalizedQuery)
    )
  })

  // Linked state display
  if (linkedMediaId) {
    const matchedOption = supportedGames.find(
      (g) =>
        g.otixGameId.toLowerCase() === linkedMediaId.toLowerCase() ||
        g.gameTitle.toLowerCase() === linkedGameTitle.toLowerCase(),
    )
    const iconUrl = matchedOption?.iconUrl ?? getPresetIconUrl(matchedOption?.presets[0])

    return (
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
        <div className="flex items-center gap-2.5 min-w-0">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={linkedGameTitle}
              className="w-6 h-6 rounded-md object-cover bg-[var(--dk-surface-overlay)] shrink-0"
            />
          ) : (
            <Gamepad2 size={18} className="text-primary shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate">{linkedGameTitle}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium shrink-0">
                Linked Otix Game
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              Full support enabled for this game
            </p>
          </div>
        </div>

        {!isInitialLinked && (
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUnlinkGame}
            title="Unlink and configure manually"
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 gap-1"
          >
            <Unlink size={13} />
            <span>Unlink</span>
          </DkButton>
        )}
      </div>
    )
  }

  // Unlinked state: button to link an Otix game
  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-xs text-foreground/80 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer select-none text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link2 size={14} className="text-primary shrink-0" />
          <span className="font-medium truncate">Link to an Otix Game for Full Support</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
          <span className="text-[10px] font-mono">Optional</span>
          <ChevronDown
            size={14}
            className={cn('transition-transform duration-150', open && 'rotate-180 text-primary')}
          />
        </div>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed p-2 rounded-2xl z-[99999] max-h-[320px] overflow-hidden flex flex-col backdrop-blur-2xl"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px var(--dk-separator)',
            }}
          >
            <div className="relative mb-2 shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Otix games..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-[var(--dk-surface-ghost)] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none ring-1 ring-transparent focus:ring-primary/40 transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
              {filteredGames.map((game: SupportedOtixGameOption) => (
                <button
                  key={game.otixGameId}
                  type="button"
                  role="option"
                  onClick={() => {
                    onLinkGame(game.otixGameId, game.gameTitle)
                    setOpen(false)
                  }}
                  className="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-left cursor-pointer transition-colors text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost)]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {game.iconUrl ? (
                      <img
                        src={game.iconUrl}
                        alt={game.gameTitle}
                        className="w-5 h-5 rounded-md object-cover bg-[var(--dk-surface-ghost)] shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <Gamepad2 size={15} className="text-primary shrink-0" />
                    )}
                    <span className="truncate">{game.gameTitle}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {game.presets.length > 1
                      ? `${game.presets.length} options`
                      : `:${game.presets[0].defaultPort}`}
                  </span>
                </button>
              ))}

              {filteredGames.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No games matching &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
