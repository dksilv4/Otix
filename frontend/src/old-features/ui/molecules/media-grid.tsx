import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface DkMediaGridProps {
  children: ReactNode
  className?: string
}

function DkMediaGrid({ children, className }: DkMediaGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export { DkMediaGrid, DkMediaGrid as MediaGrid }
