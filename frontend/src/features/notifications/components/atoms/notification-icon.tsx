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
    <div className={cn('shrink-0 rounded-xl p-2 bg-white/5', className)}>
      {createElement(Icon, { className: cn('h-4 w-4', config?.color ?? 'text-white/70') })}
    </div>
  )
};
