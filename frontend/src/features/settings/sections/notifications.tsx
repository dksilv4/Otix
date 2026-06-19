import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { DkSwitch } from '@/old-features/dk-ui/atoms/switch'

const NOTIFICATION_CATEGORIES = [
  {
    id: 'social',
    label: 'Social',
    description: 'Friend requests, accepts, and removals',
    types: [
      { key: 'friend_request', label: 'Friend requests' },
      { key: 'friend_accepted', label: 'Friend requests accepted' },
      { key: 'friend_rejected', label: 'Friend requests declined' },
      { key: 'friend_removed', label: 'Friends removed' },
    ],
  },
  {
    id: 'follows',
    label: 'Follows',
    description: 'Follow and follow request activity',
    types: [
      { key: 'follow', label: 'New followers' },
      { key: 'follow_request', label: 'Follow requests' },
      { key: 'follow_request_accepted', label: 'Follow requests accepted' },
    ],
  },
  {
    id: 'lists',
    label: 'Lists',
    description: 'List collaboration invitations and responses',
    types: [
      { key: 'list_invitation', label: 'List invitations' },
      { key: 'list_invitation_accepted', label: 'Invitations accepted' },
      { key: 'list_invitation_declined', label: 'Invitations declined' },
    ],
  },
  {
    id: 'ratings',
    label: 'Ratings',
    description: 'User rating notifications',
    types: [
      { key: 'user_rating', label: 'New ratings' },
    ],
  },
]

export function NotificationsSection() {
  const { user, refreshUser } = useAuth()
  const [preferences, setPreferences] = useState<Record<string, boolean>>(
    user?.notificationPreferences ?? {},
  )

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences(user.notificationPreferences)
    }
  }, [user?.notificationPreferences])

  const handleToggle = async (type: string, checked: boolean) => {
    setPreferences((prev) => ({ ...prev, [type]: checked }))
    const newPrefs = { ...preferences, [type]: checked }
    try {
      await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
      await refreshUser()
    } catch {
      setPreferences(preferences)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Notification Preferences</h2>
        <p className="text-sm text-white/60 mt-1">
          Choose which notifications trigger a toast popup. Notifications still appear in your inbox regardless of these settings.
        </p>
      </div>

      {NOTIFICATION_CATEGORIES.map((category) => (
        <div
          key={category.id}
          className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl"
        >
          <div>
            <h3 className="text-sm font-semibold">{category.label}</h3>
            <p className="text-xs text-white/60 mt-0.5">{category.description}</p>
          </div>
          <div className="mt-4 space-y-4">
            {category.types.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium">{label}</span>
                <DkSwitch
                  checked={preferences[key] !== false}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
