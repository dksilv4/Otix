import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import './media-grid.scss'

interface DkMediaGridProps {
  children: ReactNode
  className?: string
}

function DkMediaGrid({ children, className }: DkMediaGridProps) {
  return (
    <div className={cn('dk-media-grid', className)}>
      {children}
    </div>
  )
}

export { DkMediaGrid, DkMediaGrid as MediaGrid }
