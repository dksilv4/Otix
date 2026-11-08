import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GameEdition } from '../../types'
import { formatEditionName, getEditionYear } from '../../utils/editions'

export interface GameEditionSelectorProps {
  editions: GameEdition[]
  selectedEditionId: number | null
  onSelectEdition: (editionId: number | null) => void
  baseGameTitle: string
  baseReleaseDate?: string | null
  className?: string
}

export const GameEditionSelector = ({
  editions,
  selectedEditionId,
  onSelectEdition,
  baseGameTitle,
  baseReleaseDate,
  className,
}: GameEditionSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  })

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 240),
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updateCoords()
    const handleScroll = () => updateCoords()
    const handleResize = () => updateCoords()
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true })
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, updateCoords])

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const selectedEdition = editions.find((ed) => ed.id === selectedEditionId) || null
  const currentLabel = formatEditionName(selectedEdition, baseGameTitle)

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium',
          'bg-card/60 hover:bg-card/80 text-foreground',
          'border border-white/[0.06] shadow-sm backdrop-blur-md',
          'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
          isOpen && 'bg-card/90 ring-1 ring-primary/40',
        )}
      >
        <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate max-w-[180px]">{currentLabel}</span>
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground px-1 py-0.5 rounded bg-muted/30">
          {editions.length + 1} Editions
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 shrink-0',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="listbox"
            aria-label="Select Game Edition"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.width}px`,
            }}
            className={cn(
              'z-50 py-1 rounded-xl shadow-xl',
              'bg-popover/90 text-popover-foreground border border-white/[0.08] backdrop-blur-xl',
              'animate-in fade-in-0 zoom-in-95 duration-100',
            )}
          >
            {/* Base Game (Standard Edition) */}
            <button
              type="button"
              role="option"
              aria-selected={selectedEditionId === null}
              onClick={() => {
                onSelectEdition(null)
                setIsOpen(false)
              }}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-left',
                'hover:bg-accent/40 transition-colors duration-100',
                selectedEditionId === null && 'text-primary font-medium bg-primary/10',
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="truncate">Standard Edition</span>
                {baseReleaseDate && (
                  <span className="text-[10px] text-muted-foreground">
                    {getEditionYear(baseReleaseDate)}
                  </span>
                )}
              </div>
              {selectedEditionId === null && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>

            <div className="h-px my-1 bg-border/40" />

            {/* Alternate Editions */}
            {editions.map((ed) => {
              const isSelected = selectedEditionId === ed.id
              const year = getEditionYear(ed.releaseDate)
              return (
                <button
                  key={ed.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectEdition(ed.id)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-left',
                    'hover:bg-accent/40 transition-colors duration-100',
                    isSelected && 'text-primary font-medium bg-primary/10',
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{ed.name || ed.rawTitle}</span>
                    {year && <span className="text-[10px] text-muted-foreground">{year}</span>}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
