import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface MediaGridProps {
  children: ReactNode
  className?: string
}

export function MediaGrid({ children, className }: MediaGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
