import { useAuth } from '@/lib/providers/auth'
import { AccountSection } from '../sections/settings-account'

export function SettingsAccountPage() {
  const { user, isAuthenticated } = useAuth()
  return <AccountSection user={user} isAuthenticated={isAuthenticated} />
}
