import { Bell } from 'lucide-react'

export const NotificationEmpty = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Bell className="h-10 w-10 text-muted-foreground/30" />
      <p className="mt-4 text-sm text-muted-foreground">No notifications yet</p>
    </div>
  )
};
