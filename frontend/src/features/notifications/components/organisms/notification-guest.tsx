import { Bell } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export function NotificationGuest() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Bell className="h-10 w-10 text-white/30" />
      <h2 className="mt-4 text-sm font-semibold text-white/60">Sign in to view notifications</h2>
      <Link
        to="/auth/login"
        className="mt-3 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Sign in
      </Link>
    </div>
  )
}
