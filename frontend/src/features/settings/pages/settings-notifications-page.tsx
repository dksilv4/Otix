import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, Lock } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { usePushSubscription } from '@/features/notifications/hooks/use-push-subscription'
import type { NotificationType } from '@/features/notifications/types'
import { getTypeConfig } from '@/features/notifications/registry'
import { SettingsCard } from '../components/molecules/settings-card'
import { SectionHeader } from '../components/molecules/settings-section-header'

const LOCAL_PREFS_KEY = 'otix:local-notification-preferences'

function getLocalPrefs(): Record<string, boolean | string> {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalPrefs(prefs: Record<string, boolean | string>) {
  try {
    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

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
      {/* Delivery Channels (Local & Device Settings) */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Delivery Channels"
          description="Configure how local notifications sound and display on this device."
        />

        {isDesktop() && (
          <div className="flex items-center justify-between gap-4 py-1 min-h-[44px]">
            <div>
              <span className="text-sm font-medium text-white">Desktop notifications</span>
              <p className="text-xs text-white/40">Native OS notifications via Electron</p>
            </div>
            <DkSwitch
              checked={preferences._desktop_enabled !== false}
              onCheckedChange={(c) => handleToggle('_desktop_enabled', c)}
            />
          </div>
        )}

        {typeof Notification !== 'undefined' && (
          <div className="flex items-center justify-between gap-4 py-1 min-h-[44px]">
            <div>
              <span className="text-sm font-medium text-white">Browser notifications</span>
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
          <div className="flex items-center justify-between gap-4 py-1 min-h-[44px]">
            <div>
              <span className="text-sm font-medium text-white">Push notifications</span>
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
              className="rounded-lg px-3.5 py-1.5 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {push.subscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 py-1 min-h-[44px]">
          <div>
            <span className="text-sm font-medium text-white">Notification sound</span>
            <p className="text-xs text-white/40">Play a chime on new notifications</p>
          </div>
          <DkSwitch
            checked={preferences._sound_enabled === true}
            onCheckedChange={(c) => handleToggle('_sound_enabled', c)}
          />
        </div>
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
              <label className="text-xs text-white/60 block mb-1 font-medium">Start</label>
              <input
                type="time"
                value={(preferences._quiet_start as string) || '22:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_start', e.target.value)}
                className="w-full rounded-xl bg-white/5 px-3.5 py-2 text-sm text-white/90 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/60 block mb-1 font-medium">End</label>
              <input
                type="time"
                value={(preferences._quiet_end as string) || '08:00'}
                onChange={(e) => handleQuietTimeChange('_quiet_end', e.target.value)}
                className="w-full rounded-xl bg-white/5 px-3.5 py-2 text-sm text-white/90 focus:outline-none"
              />
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Account Notifications Header / Guest Banner */}
      {!user ? (
        <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-primary/10 via-white/5 to-white/5 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Social & Follow Notifications</h4>
              <p className="text-xs text-white/60 mt-0.5 max-w-md">
                Sign in to customize social activity alerts, friend requests, list invitations, and watchlist releases across all your devices.
              </p>
            </div>
          </div>
          <Link
            to="/auth/login"
            className="shrink-0 inline-flex items-center gap-2 font-semibold rounded-xl px-5 py-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-[0.98]"
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Sign In to Sync</span>
          </Link>
        </div>
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
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between gap-4 py-1 min-h-[40px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <config.icon className={cn('h-4.5 w-4.5', config.color)} />
                      <span className="text-sm font-medium text-white/90">{config.label}</span>
                    </div>
                    <DkSwitch
                      checked={preferences[type] !== false}
                      onCheckedChange={(checked) => handleToggle(type, checked)}
                    />
                  </div>
                )
              })}
            </div>
          </SettingsCard>
        ))
      )}
    </div>
  )
}
