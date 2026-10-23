import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Lock, Users, X, Loader2 } from 'lucide-react'
import { SectionPrivacyToggle } from './section-privacy-toggle'
import type { SectionVisibility } from '../../types'

export interface SectionHeaderProps {
  icon: LucideIcon
  title: string
  summary?: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
  actions?: ReactNode
  className?: string
}

export const SectionHeader = ({
  icon: Icon,
  title,
  summary,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
  actions,
  className = '',
}: SectionHeaderProps) => {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </span>
        {summary && (
          <>
            <span className="text-muted-foreground/30">/</span>
            <span className="text-muted-foreground font-medium">{summary}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        {isOwner && (onToggleVisibility || onChangeVisibility) ? (
          <SectionPrivacyToggle
            visibility={visibility}
            onToggle={onToggleVisibility}
            onChangeVisibility={onChangeVisibility}
            isUpdating={isUpdatingVisibility}
          />
        ) : visibility === 'private' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <Lock className="h-3 w-3 text-muted-foreground/50" />
            Private
          </span>
        ) : visibility === 'friends' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <Users className="h-3 w-3 text-muted-foreground/50" />
            Friends
          </span>
        ) : null}
        {actions}
        {isOwner && onRemove && (
          <button
            type="button"
            disabled={isRemoving}
            onClick={() => {
              if (!isRemoving) void onRemove()
            }}
            title={`Remove ${title} section`}
            aria-label={`Remove ${title} section`}
            className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-[var(--dk-surface-ghost-hover)] transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRemoving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
