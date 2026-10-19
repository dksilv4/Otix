import { createElement } from 'react'
import { cn } from '@/lib/utils'
import { getTypeConfig, getTypeIcon } from '../../registry'
import type { NotificationType } from '../../types'

interface NotificationIconProps {
  type: NotificationType
  className?: string
}

export const NotificationIcon = ({ type, className }: NotificationIconProps) => {
  const config = getTypeConfig(type)
  const Icon = getTypeIcon(type)
  return (
    <div className={cn('shrink-0 rounded-xl p-2 bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)]', className)}>
      {createElement(Icon, { className: cn('h-4 w-4', config?.color ?? 'text-muted-foreground') })}
    </div>
  )
};
