import React, { memo } from 'react'
import { Clock, Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MediaActivityStatus } from '../../types/media-activity'
import { formatActivityTooltip } from '../../utils/media-activity'

export interface MediaActivityTagProps {
  status: MediaActivityStatus
  progress?: number
  nodeName?: string
  ownerName?: string
  isOwned?: boolean
  onClick?: (e: React.MouseEvent) => void
  className?: string
}

export const MediaActivityTag = memo(({
  status,
  progress,
  nodeName,
  ownerName,
  isOwned = true,
  onClick,
  className,
}: MediaActivityTagProps) => {
  const tooltip = formatActivityTooltip(status, nodeName, ownerName, isOwned, progress)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClick?.(e)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        'inline-flex items-center justify-center h-6 w-6 rounded-full',
        'backdrop-blur-md shadow-sm border border-white/[0.06]',
        'transition-transform duration-300 hover:scale-110 active:scale-95 cursor-pointer',
        status === 'available' && 'bg-primary/20 text-primary',
        status === 'processing' && 'bg-sky-500/20 text-sky-400',
        status === 'requested' && 'bg-amber-500/20 text-amber-400',
        className,
      )}
    >
      {status === 'available' && <Play className="h-2.5 w-2.5 fill-current ml-0.5" />}
      {status === 'processing' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {status === 'requested' && <Clock className="h-2.5 w-2.5" />}
    </button>
  )
})
