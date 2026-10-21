import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Lock, Users } from 'lucide-react'
import { SectionPrivacyToggle } from './section-privacy-toggle'
import type { SectionVisibility } from '../../types'

interface SectionHeaderProps {
  icon: LucideIcon
  title: string
  summary?: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
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

      <div className="flex items-center gap-3">
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
      </div>
    </div>
  )
}

