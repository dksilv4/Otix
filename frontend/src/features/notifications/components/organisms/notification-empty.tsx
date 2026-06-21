import { Bell } from 'lucide-react'

export function NotificationEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Bell className="h-10 w-10 text-white/20" />
      <p className="mt-4 text-sm text-white/40">No notifications yet</p>
    </div>
  )
}
