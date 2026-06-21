import { cn } from '@/lib/utils'
import { getTypeConfig } from '../../registry'
import type { NotificationType } from '../../types'

interface NotificationIconProps {
  type: NotificationType
  className?: string
}

export function NotificationIcon({ type, className }: NotificationIconProps) {
  const config = getTypeConfig(type)
  const Icon = config.icon
  return (
    <div className={cn('shrink-0 rounded-xl p-2 bg-white/5', className)}>
      <Icon className={cn('h-4 w-4', config.color)} />
    </div>
  )
}
