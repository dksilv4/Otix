import { useAuth } from '@/lib/providers/auth'
import { AccountSection } from '@/old-features/settings/organisms/settings-sections/account'

export function SettingsAccountPage() {
  const { user, isAuthenticated } = useAuth()
  return <AccountSection user={user} isAuthenticated={isAuthenticated} />
}
