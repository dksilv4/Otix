export { NOTIFICATION_TYPES, getTypeConfig, getTypeIcon } from './registry'
export { NotificationRouter } from './channels'
export { createNotificationRoutes } from './router'
export { NotificationsPage } from './pages/notifications-page'
export type {
  Notification, NotificationType, TypeConfig, ActionButton,
  ActionCallbacks, NotificationEvent, Channel, NotificationPreferences,
  NotificationListResponse, UnreadCount,
} from './types'
