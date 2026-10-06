import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { getTypeConfig } from '../../registry'
import { NotificationIcon } from '../atoms/notification-icon'
import { NotificationTime } from '../atoms/notification-time'
import { NotificationActions } from './notification-actions'
import type { Notification, ActionCallbacks } from '../../types'
import type { UseMutateFunction } from '@tanstack/react-query'

interface NotificationCardProps {
  notification: Notification
  onMarkRead: UseMutateFunction<void, Error, string, unknown>
  actionCallbacks: ActionCallbacks
}

export const NotificationCard = ({ notification, onMarkRead, actionCallbacks }: NotificationCardProps) => {
  const navigate = useNavigate()
  const config = getTypeConfig(notification.type)
  const link = config?.getLink?.(notification)
  const actions = config?.getActions?.(notification, actionCallbacks)

  const handleClick = () => {
    if (link) navigate({ to: link })
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-3 rounded-xl transition-colors',
        !notification.isRead && 'bg-white/[0.03]',
        link && 'cursor-pointer hover:bg-white/[0.06]',
      )}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' && link) handleClick() }}
      role={link ? 'button' : undefined}
      tabIndex={link ? 0 : undefined}
    >
      <NotificationIcon type={notification.type} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-white/80">{notification.title}</p>
          <NotificationTime createdAt={notification.createdAt} />
        </div>
        {notification.body && (
          <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        {actions && <NotificationActions actions={actions} />}
      </div>

      {!notification.isRead && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id) }}
          className="shrink-0 mt-1 cursor-pointer"
          aria-label="Mark as read"
        >
          <span className="block h-2 w-2 rounded-full bg-primary" />
        </button>
      )}
    </div>
  )
};
