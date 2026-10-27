import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsNotificationsPage } from '../pages/settings-notifications-page'
import { apiClient } from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    patch: vi.fn().mockResolvedValue({}),
  },
}))

const mockRefreshUser = vi.fn()
const mockUser = {
  id: 1,
  notificationPreferences: {
    _desktop_enabled: true,
    _web_enabled: true,
    _sound_enabled: false,
  },
}

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    refreshUser: mockRefreshUser,
  }),
}))

vi.mock('@/features/notifications/hooks/use-push-subscription', () => ({
  usePushSubscription: () => ({
    supported: true,
    error: null,
    blockedReason: null,
    subscribed: false,
    registering: false,
    register: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}))

describe('SettingsNotificationsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    // Ensure Notification is defined for testing browser notifications row
    Object.defineProperty(window, 'Notification', {
      value: {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders icons for all Delivery Channels rows including Browser notifications', () => {
    render(<SettingsNotificationsPage />)

    const channels = [
      { label: 'Desktop notifications', iconClass: 'lucide-monitor' },
      { label: 'Browser notifications', iconClass: 'lucide-globe' },
      { label: 'Push notifications', iconClass: 'lucide-radio' },
      { label: 'Notification sound', iconClass: 'lucide-volume-2' },
    ]

    for (const channel of channels) {
      const label = screen.getByText(channel.label)
      expect(label).toBeDefined()

      const row = label.closest('div.rounded-xl') as HTMLElement
      expect(row).not.toBeNull()

      const iconContainer = row.querySelector('div.bg-primary\\/10')
      expect(iconContainer).not.toBeNull()

      const svgIcon = iconContainer?.querySelector('svg')
      expect(svgIcon).not.toBeNull()
      expect(svgIcon?.getAttribute('class')).toContain(channel.iconClass)
    }
  })

  it('toggles browser notification preference when clicked', async () => {
    render(<SettingsNotificationsPage />)

    const label = screen.getByText('Browser notifications')
    const row = label.closest('div.rounded-xl') as HTMLElement
    const switchBtn = row.querySelector('button[role="switch"]') as HTMLElement
    expect(switchBtn).not.toBeNull()

    fireEvent.click(switchBtn)

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({
        notification_preferences: expect.objectContaining({
          _web_enabled: false,
        }),
      }),
    )
  })
})
