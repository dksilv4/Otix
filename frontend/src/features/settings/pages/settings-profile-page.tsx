import { useAuth } from '@/lib/providers/auth'
import { ProfileSection } from '@/old-features/settings/organisms/settings-sections/profile'

export function SettingsProfilePage() {
  const { user, isAuthenticated } = useAuth()
  return <ProfileSection user={user} isAuthenticated={isAuthenticated} />
}
