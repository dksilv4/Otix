import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SectionVisibility } from '../../types'
import { PRIVACY_OPTIONS, getNextSectionVisibility } from '../../utils/profile-sections'

export interface SectionPrivacyToggleProps {
  visibility: SectionVisibility
  onToggle?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdating?: boolean
  className?: string
}

export const SectionPrivacyToggle = ({
  visibility,
  onToggle,
  onChangeVisibility,
  isUpdating = false,
  className = '',
}: SectionPrivacyToggleProps) => {
  const currentOption =
    PRIVACY_OPTIONS.find((opt) => opt.value === visibility) ?? PRIVACY_OPTIONS[0]
  const Icon = currentOption.icon

  const handleClick = () => {
    if (isUpdating) return
    const next = getNextSectionVisibility(visibility)
    if (onChangeVisibility) {
      void onChangeVisibility(next)
    } else if (onToggle) {
      void onToggle()
    }
  }

  return (
    <button
      type="button"
      disabled={isUpdating}
      onClick={handleClick}
      title={`${currentOption.tooltip} (click to change)`}
      aria-label={`Section privacy: ${currentOption.label}. Click to switch.`}
      className={cn(
        'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-white/[0.06] bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground backdrop-blur-md shadow-xs',
        className,
      )}
    >
      {isUpdating ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <Icon
          className={cn(
            'h-3 w-3 transition-colors',
            visibility === 'public' || visibility === 'friends'
              ? 'text-primary'
              : 'text-muted-foreground',
          )}
        />
      )}
      <span>{currentOption.label}</span>
    </button>
  )
}
