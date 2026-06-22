import { useAuth } from '@/lib/providers/auth'
import { ProfileSection } from '../sections/settings-profile'

export function SettingsProfilePage() {
  const { user, isAuthenticated } = useAuth()
  return <ProfileSection user={user} isAuthenticated={isAuthenticated} />
}
