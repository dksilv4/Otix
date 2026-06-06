import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import './card.scss'

interface DkCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Elevation level: none, sm, md, lg, glass */
  elevation?: 'none' | 'sm' | 'md' | 'lg' | 'glass'
  /** If true, card is interactive (hover lift) */
  interactive?: boolean
}

const DkCard = forwardRef<HTMLDivElement, DkCardProps>(
  ({ className, elevation = 'sm', interactive, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'dk-card',
          elevation !== 'none' && `dk-card--elevation-${elevation}`,
          elevation === 'glass' && 'dk-card--glass',
          interactive && 'dk-card--interactive',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
DkCard.displayName = 'DkCard'

export { DkCard }
