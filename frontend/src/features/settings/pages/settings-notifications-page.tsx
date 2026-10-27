import { useState, useEffect } from 'react'
import { Bell, Lock, Volume2, Monitor, Radio, Globe } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { DkSwitch } from '@ui/atoms/switch'
import { usePushSubscription } from '@/features/notifications/hooks/use-push-subscription'
import type { NotificationType } from '@/features/notifications/types'
import { getTypeConfig } from '@/features/notifications/registry'
import { SettingsCard } from '../components/molecules/settings-card'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsRow } from '../components/molecules/settings-row'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import {
  getLocalPrefs,
  saveLocalPrefs,
} from '../utils/notifications'

const CATEGORIES: { id: string; label: string; description: string; types: NotificationType[] }[] = [
  {
    id: 'social',
    label: 'Social',
    description: 'Friend requests, accepts, and removals',
    types: ['friend_request', 'friend_accepted', 'friend_rejected', 'friend_removed', 'like', 'comment'],
  },
  {
    id: 'follows',
    label: 'Follows',
    description: 'Follow and follow request activity',
    types: ['follow', 'follow_request', 'follow_request_accepted'],
  },
  {
    id: 'lists',
    label: 'Lists',
    description: 'List collaboration invitations and responses',
    types: ['list_invitation', 'list_invitation_accepted', 'list_invitation_declined'],
  },
  {
    id: 'ratings',
    label: 'Ratings',
    description: 'User rating notifications',
    types: ['user_rating'],
  },
  {
    id: 'releases',
    label: 'Releases',
    description: 'Watchlisted media releases, new seasons, and studios you follow',
    types: ['release_available', 'new_season', 'studio_release'],
  },
]

export const SettingsNotificationsPage = () => {
  const { user, refreshUser } = useAuth()
  const local = getLocalPrefs()

  const [preferences, setPreferences] = useState<Record<string, boolean | string>>(() => ({
    ...local,
    ...(user?.notificationPreferences ?? {}),
  }))

  const [quietEnabled, setQuietEnabled] = useState(
    !!(user?.notificationPreferences?._quiet_start || local._quiet_start),
  )

  const push = usePushSubscription()

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences((prev) => ({
        ...prev,
        ...user.notificationPreferences,
      }))
    }
  }, [user?.notificationPreferences])

  const handleToggle = async (key: string, checked: boolean) => {
    const newPrefs = { ...preferences, [key]: checked }
    setPreferences(newPrefs)
    saveLocalPrefs(newPrefs)

    if (user) {
      try {
        await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
        await refreshUser()
      } catch {
        setPreferences(preferences)
      }
    }
  }

  const handleQuietTimeChange = async (key: string, value: string) => {
    const newPrefs = { ...preferences, [key]: value }
    setPreferences(newPrefs)
    saveLocalPrefs(newPrefs)

    if (user) {
      try {
        await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
        await refreshUser()
      } catch {
        setPreferences(preferences)
      }
    }
  }

  return (
    <div id="settings-notifications-section" className="space-y-5">
      <SectionHeader
        variant="page"
        icon={Bell}
        title="Notifications"
        description="Delivery channels, quiet hours, and per-category alerts."
      />

      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Delivery Channels"
          description="Configure how local notifications sound and display on this device."
        />

        <SettingsRow
          icon={<Monitor className="h-5 w-5" />}
          label="Desktop notifications"
          description="Native OS notifications and system alerts"
          action={
            <DkSwitch
              checked={preferences._desktop_enabled !== false}
              onCheckedChange={(c) => handleToggle('_desktop_enabled', c)}
            />
          }
        />

        {typeof Notification !== 'undefined' && (
          <SettingsRow
            icon={<Globe className="h-5 w-5" />}
            label="Browser notifications"
            description={
              Notification.permission === 'granted'
                ? 'Permission granted'
                : Notification.permission === 'denied'
                  ? 'Permission denied — update browser settings'
                  : 'Click to request permission'
            }
            action={
              <DkSwitch
                checked={preferences._web_enabled !== false}
                onCheckedChange={(c) => handleToggle('_web_enabled', c)}
              />
            }
          />
        )}

        {push.supported && (
          <SettingsRow
            icon={<Radio className="h-5 w-5" />}
            label="Push notifications"
            description={
              push.error
                ? push.error
                : push.blockedReason
                  ? push.blockedReason
                  : push.subscribed
                    ? 'Active — works when tab is closed'
                    : push.registering
                      ? 'Registering...'
                      : 'Off — works when the tab is closed'
            }
            disabled={push.registering || (!push.subscribed && !!push.blockedReason)}
            action={
              <DkSwitch
                checked={push.subscribed}
                disabled={push.registering || (!push.subscribed && !!push.blockedReason)}
                onCheckedChange={(checked) => {
                  if (checked) void push.register()
                  else void push.unsubscribe()
                }}
              />
            }
          />
        )}

        <SettingsRow
          icon={<Volume2 className="h-5 w-5" />}
          label="Notification sound"
          description="Play a chime on new notifications"
          action={
            <DkSwitch
              checked={preferences._sound_enabled === true}
              onCheckedChange={(c) => handleToggle('_sound_enabled', c)}
            />
          }
        />
      </SettingsCard>

      {/* Quiet Hours (Local & Device Settings) */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Quiet Hours"
          description="Suppress all notifications on this device during this window"
          action={
            <DkSwitch
              checked={quietEnabled}
              onCheckedChange={(c) => {
                setQuietEnabled(c)
                if (!c) {
                  handleQuietTimeChange('_quiet_start', '')
                  handleQuietTimeChange('_quiet_end', '')
                } else {
                  handleQuietTimeChange('_quiet_start', '22:00')
                  handleQuietTimeChange('_quiet_end', '08:00')
                }
              }}
            />
          }
        />
        {quietEnabled && (
          <div className="flex flex-col sm:flex-row gap-4 pt-1">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1 font-medium">Start</label>
              <input
                type="time"
                value={(preferences._quiet_start as string) || '22:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_start', e.target.value)}
                className="w-full rounded-xl bg-[var(--dk-surface-field)] px-3.5 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1 font-medium">End</label>
              <input
                type="time"
                value={(preferences._quiet_end as string) || '08:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_end', e.target.value)}
                className="w-full rounded-xl bg-[var(--dk-surface-field)] px-3.5 py-2 text-sm text-foreground focus:outline-none"
              />
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Account Notifications Header / Guest Banner */}
      {!user ? (
        <SettingsLockedState
          title="Social & Follow Notifications"
          description="Sign in to customize social activity alerts, friend requests, list invitations, and watchlist releases across all your devices."
          icon={Lock}
        />
      ) : (
        /* Per-type toggles for authenticated users */
        CATEGORIES.map((category) => (
          <SettingsCard key={category.id}>
            <SectionHeader
              title={category.label}
              description={category.description}
            />
            <div className="mt-4 space-y-3">
              {category.types.map((type) => {
                const config = getTypeConfig(type)
                if (!config) return null
                return (
                  <SettingsRow
                    key={type}
                    icon={<config.icon className={cn('h-4.5 w-4.5', config.color)} />}
                    label={config.label}
                    action={
                      <DkSwitch
                        checked={preferences[type] !== false}
                        onCheckedChange={(checked) => handleToggle(type, checked)}
                      />
                    }
                  />
                )
              })}
            </div>
          </SettingsCard>
        ))
      )}
    </div>
  )
};
