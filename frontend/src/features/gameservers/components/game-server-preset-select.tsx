import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search, Sparkles, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findPresetById, getPresetsByCategory, getPresetIconUrl } from '../utils/presets'

interface GameServerPresetSelectProps {
  value: string
  onChange: (presetId: string) => void
  disabled?: boolean
}

export const GameServerPresetSelect = ({
  value,
  onChange,
  disabled = false,
}: GameServerPresetSelectProps) => {
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
    const dropdownHeight = 340

    // If tight at bottom of viewport, position above trigger
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

    // Auto-focus search input when opened
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown itself
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

  const selectedPreset = findPresetById(value)
  const selectedIcon = getPresetIconUrl(selectedPreset)

  const normalizedQuery = search.toLowerCase().trim()
  const categoryGroups = getPresetsByCategory()

  const filteredGroups = categoryGroups
    .map((group) => ({
      category: group.category,
      presets: group.presets.filter((p) => {
        if (!normalizedQuery) return true
        return (
          p.name.toLowerCase().includes(normalizedQuery) ||
          p.gameTitle.toLowerCase().includes(normalizedQuery) ||
          String(p.defaultPort).includes(normalizedQuery) ||
          (p.defaultQueryPort && String(p.defaultQueryPort).includes(normalizedQuery))
        )
      }),
    }))
    .filter((group) => group.presets.length > 0)

  const totalMatching = filteredGroups.reduce((acc, g) => acc + g.presets.length, 0)

  return (
    <div className="relative w-full">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'w-full h-11 px-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-sm text-foreground flex items-center justify-between gap-2.5 transition-colors cursor-pointer select-none text-left',
          open && 'bg-[var(--dk-surface-ghost-hover)] ring-1 ring-primary',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedPreset ? (
            selectedIcon ? (
              <img
                src={selectedIcon}
                alt={selectedPreset.name}
                className="w-5 h-5 rounded-md object-cover bg-[var(--dk-surface-overlay)] shrink-0"
              />
            ) : (
              <Gamepad2 size={16} className="text-primary shrink-0" />
            )
          ) : (
            <Sparkles size={16} className="text-primary shrink-0" />
          )}
          <span className="truncate font-medium">
            {selectedPreset ? selectedPreset.name : 'Custom / Manual Configuration'}
          </span>
          {selectedPreset && (
            <span className="text-[11px] font-mono text-muted-foreground shrink-0">
              :{selectedPreset.defaultPort}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'text-muted-foreground shrink-0 transition-transform duration-150',
            open && 'rotate-180 text-primary',
          )}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed p-2 rounded-2xl z-[99999] max-h-[340px] overflow-hidden flex flex-col backdrop-blur-2xl"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px var(--dk-separator)',
            }}
          >
            {/* Search Input Header */}
            <div className="relative mb-2 shrink-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 65+ games or ports..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-[var(--dk-surface-ghost)] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none ring-1 ring-transparent focus:ring-primary/40 transition-colors"
              />
            </div>

            {/* Scrollable Options List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
              {/* Custom manual option */}
              {(!normalizedQuery || 'custom manual configuration'.includes(normalizedQuery)) && (
                <div>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === 'custom'}
                    onClick={() => {
                      onChange('custom')
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-left cursor-pointer transition-colors',
                      value === 'custom'
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Sparkles size={15} className="text-primary shrink-0" />
                      <span className="truncate">Custom / Manual Configuration</span>
                    </div>
                    {value === 'custom' && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                </div>
              )}

              {/* Categorized presets */}
              {filteredGroups.map((group) => (
                <div key={group.category} className="space-y-1">
                  <div className="px-2.5 pt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.category}
                  </div>
                  <div className="space-y-0.5">
                    {group.presets.map((preset) => {
                      const isSelected = preset.id === value
                      const icon = getPresetIconUrl(preset)
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            onChange(preset.id)
                            setOpen(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-left cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-primary/15 text-primary font-semibold'
                              : 'text-foreground/90 hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {icon ? (
                              <img
                                src={icon}
                                alt={preset.name}
                                className="w-5 h-5 rounded-md object-cover bg-[var(--dk-surface-ghost)] shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <Gamepad2 size={15} className="text-primary shrink-0" />
                            )}
                            <span className="truncate">{preset.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              :{preset.defaultPort}
                            </span>
                            {isSelected && <Check size={14} className="text-primary" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {totalMatching === 0 && (
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
