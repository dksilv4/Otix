import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface DkCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Elevation level: none, sm, md, lg, glass */
  elevation?: 'none' | 'sm' | 'md' | 'lg' | 'glass'
  /** If true, card is interactive (hover lift) */
  interactive?: boolean
}

const elevationMap: Record<string, string> = {
  none: '',
  sm: 'shadow-[var(--dk-shadow-sm)]',
  md: 'shadow-[var(--dk-shadow-md)]',
  lg: 'shadow-[var(--dk-shadow-lg)]',
  glass: 'shadow-[var(--dk-shadow-glass)] backdrop-blur-xl',
}

const DkCard = forwardRef<HTMLDivElement, DkCardProps>(
  ({ className, elevation = 'sm', interactive, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl p-6 transition-all duration-[var(--dk-duration-normal)]',
          elevation === 'glass'
            ? 'bg-[var(--dk-surface-glass)]'
            : 'bg-[var(--dk-surface-base)]',
          elevationMap[elevation],
          interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--dk-shadow-md)] active:scale-[0.99]',
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
