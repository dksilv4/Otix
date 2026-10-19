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

  const isClickable = Boolean(link || !notification.isRead)

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id)
    }
    if (link) {
      navigate({ to: link })
    }
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-3 rounded-xl transition-colors',
        !notification.isRead && 'bg-primary/5',
        isClickable && 'cursor-pointer hover:bg-[var(--dk-surface-ghost-hover)]',
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && isClickable) {
          handleClick()
        }
      }}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <NotificationIcon type={notification.type} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-foreground">{notification.title}</p>
          <NotificationTime createdAt={notification.createdAt} />
        </div>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        {actions && (
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationActions actions={actions} />
          </div>
        )}
      </div>

      {!notification.isRead && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMarkRead(notification.id)
          }}
          className="shrink-0 mt-1 cursor-pointer"
          aria-label="Mark as read"
        >
          <span className="block h-2 w-2 rounded-full bg-primary" />
        </button>
      )}
    </div>
  )
};
