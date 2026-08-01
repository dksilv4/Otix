import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { usePushSubscription } from '@/features/notifications/hooks/use-push-subscription'
import type { NotificationType } from '@/features/notifications/types'
import { getTypeConfig } from '@/features/notifications/registry'

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
    description: 'Watchlisted media releases and new season announcements',
    types: ['release_available', 'new_season'],
  },
]

export function SettingsNotificationsPage() {
  const { user, refreshUser } = useAuth()
  const [preferences, setPreferences] = useState<Record<string, boolean | string>>(
    user?.notificationPreferences ?? {},
  )
  const [quietEnabled, setQuietEnabled] = useState(
    !!user?.notificationPreferences?._quiet_start,
  )
  const push = usePushSubscription()

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPreferences(user.notificationPreferences)
    }
  }, [user?.notificationPreferences])

  const handleToggle = async (key: string, checked: boolean) => {
    const newPrefs = { ...preferences, [key]: checked }
    setPreferences(newPrefs)
    try {
      await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
      await refreshUser()
    } catch {
      setPreferences(preferences)
    }
  }

  const handleQuietTimeChange = async (key: string, value: string) => {
    const newPrefs = { ...preferences, [key]: value }
    setPreferences(newPrefs)
    try {
      await apiClient.patch('/auth/me', { notification_preferences: newPrefs })
      await refreshUser()
    } catch {
      setPreferences(preferences)
    }
  }

  return (
    <div id="settings-notifications-section" className="space-y-8">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Notification Preferences</h2>
        <p className="text-sm text-white/60 mt-1">
          Control which notifications you receive and how they&apos;re delivered.
        </p>
      </div>

      {/* Delivery Channels */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Delivery Channels</h3>
          <p className="text-xs text-white/60 mt-0.5">
            Choose how notifications reach you. Per-type toggles below still apply.
          </p>
        </div>

        {isDesktop() && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Desktop notifications</span>
              <p className="text-xs text-white/40">Native OS notifications via Electron</p>
            </div>
            <DkSwitch
              checked={preferences._desktop_enabled !== false}
              onCheckedChange={(c) => handleToggle('_desktop_enabled', c)}
            />
          </div>
        )}

        {typeof Notification !== 'undefined' && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Browser notifications</span>
              <p className="text-xs text-white/40">
                {Notification.permission === 'granted'
                  ? 'Permission granted'
                  : Notification.permission === 'denied'
                    ? 'Permission denied — update browser settings'
                    : 'Click to request permission'}
              </p>
            </div>
            <DkSwitch
              checked={preferences._web_enabled !== false}
              onCheckedChange={(c) => handleToggle('_web_enabled', c)}
            />
          </div>
        )}

        {push.supported && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium">Push notifications</span>
              <p className="text-xs text-white/40">
                {push.subscribed
                  ? 'Active — works when tab is closed'
                  : push.registering
                    ? 'Registering...'
                    : 'Off'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => push.subscribed ? push.unsubscribe() : push.register()}
              disabled={push.registering}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-white/10 text-white/60 hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-50"
            >
              {push.subscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-medium">Notification sound</span>
            <p className="text-xs text-white/40">Play a chime on new notifications</p>
          </div>
          <DkSwitch
            checked={preferences._sound_enabled === true}
            onCheckedChange={(c) => handleToggle('_sound_enabled', c)}
          />
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Quiet Hours</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Suppress all notifications during this window
            </p>
          </div>
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
        </div>
        {quietEnabled && (
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-white/60 block mb-1">Start</label>
              <input
                type="time"
                value={(preferences._quiet_start as string) || '22:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_start', e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/80"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/60 block mb-1">End</label>
              <input
                type="time"
                value={(preferences._quiet_end as string) || '08:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_end', e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white/80"
              />
            </div>
          </div>
        )}
      </div>

      {/* Per-type toggles */}
      {CATEGORIES.map((category) => (
        <div
          key={category.id}
          className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl"
        >
          <div>
            <h3 className="text-sm font-semibold">{category.label}</h3>
            <p className="text-xs text-white/60 mt-0.5">{category.description}</p>
          </div>
          <div className="mt-4 space-y-4">
            {category.types.map((type) => {
              const config = getTypeConfig(type)
              return (
                <div
                  key={type}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-2">
                    <config.icon className={cn('h-4 w-4', config.color)} />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                  <DkSwitch
                    checked={preferences[type] !== false}
                    onCheckedChange={(checked) => handleToggle(type, checked)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
