import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import { DEFAULT_SETTINGS_SECTION, rememberSettingsSection } from '../../constants'
import { NodesSecondarySettingsMenu } from './nodes-secondary-settings-menu'

export interface NodesMenuDropdownButtonProps {
  onBackToSettings?: () => void
  className?: string
}

export const NodesMenuDropdownButton = ({
  onBackToSettings,
  className,
}: NodesMenuDropdownButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const handleBackToSettings = () => {
    setIsOpen(false)
    if (onBackToSettings) {
      onBackToSettings()
    } else {
      rememberSettingsSection(DEFAULT_SETTINGS_SECTION)
      navigate({ to: `/settings/${DEFAULT_SETTINGS_SECTION}` })
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={cn('relative inline-block z-30', className)}>
      <DkButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        className="gap-2 font-semibold shadow-xs"
        aria-expanded={isOpen}
        aria-label="Toggle Nodes Menu Dropdown"
      >
        <SlidersHorizontal size={13} className="text-primary shrink-0" />
        <span>Nodes Menu</span>
        <ChevronDown
          size={13}
          className={cn(
            'transition-transform duration-200 text-muted-foreground',
            isOpen && 'rotate-180 text-foreground',
          )}
        />
      </DkButton>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-2 w-72 sm:w-80 p-4 rounded-3xl z-50',
            'bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-white/[0.06]',
            'shadow-[var(--dk-shadow-dialog)] animate-in fade-in zoom-in-95 duration-150',
          )}
        >
          <NodesSecondarySettingsMenu
            onBackToSettings={handleBackToSettings}
            onActionComplete={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
