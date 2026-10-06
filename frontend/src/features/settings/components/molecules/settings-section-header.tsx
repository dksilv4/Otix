import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Optional leading icon displayed as a tinted badge */
  icon?: ComponentType<{ className?: string }>
  /** Chips rendered beside the title (e.g. Beta) */
  badges?: ReactNode
  /** 'section' (default) for card-level headers, 'page' for top-of-page titles */
  variant?: 'section' | 'page'
}

export const SectionHeader = ({ title, description, action, className, icon: Icon, badges, variant = 'section' }: SectionHeaderProps) => {
  const isPage = variant === 'page'

  return (
    <div className={cn('flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3', !action && 'mb-4', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary',
              isPage ? 'h-10 w-10' : 'h-8 w-8',
            )}
          >
            <Icon className={isPage ? 'h-5 w-5' : 'h-4 w-4'} />
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                'font-bold text-white tracking-tight',
                isPage ? 'text-lg' : 'text-sm sm:text-base',
              )}
            >
              {title}
            </h3>
            {badges}
          </div>
          {description && (
            <p className={cn('text-white/60 mt-0.5 leading-relaxed', isPage ? 'text-sm' : 'text-xs')}>
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 self-start sm:self-center">{action}</div>}
    </div>
  )
};
