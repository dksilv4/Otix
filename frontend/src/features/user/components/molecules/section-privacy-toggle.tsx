import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SectionVisibility } from '../../types'
import { PRIVACY_OPTIONS } from '../../utils/profile-sections'

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
  return (
    <div
      role="group"
      aria-label={`Section privacy: currently ${visibility}`}
      className={cn(
        'inline-flex items-center p-0.5 rounded-full border border-white/[0.06] bg-[var(--dk-surface-ghost)] backdrop-blur-md',
        className,
      )}
    >
      {PRIVACY_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const isActive = visibility === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={isUpdating}
            onClick={() => {
              if (isUpdating) return
              if (onChangeVisibility) {
                void onChangeVisibility(opt.value)
              } else if (onToggle) {
                void onToggle()
              }
            }}
            title={opt.tooltip}
            aria-label={`Set section privacy to ${opt.label}. Currently ${isActive ? 'active' : 'inactive'}.`}
            aria-pressed={isActive}
            className={cn(
              'group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
              isActive
                ? 'bg-[var(--dk-surface-base)] text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground/70 hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
            )}
          >
            {isUpdating && isActive ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <Icon
                className={cn(
                  'h-3 w-3 transition-colors',
                  isActive
                    ? opt.value === 'public' || opt.value === 'friends'
                      ? 'text-primary'
                      : 'text-muted-foreground'
                    : 'text-muted-foreground/60 group-hover:text-foreground',
                )}
              />
            )}
            <span className={isActive ? 'inline' : 'hidden sm:inline'}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
