import {
  User,
  Palette,
  Shield,
  Bell,
  Link2,
  Download,
  Gamepad2,
  Monitor,
  Puzzle,
  Settings,
  Shuffle,
  LayoutGrid,
  HardDrive,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { PluginSettingsTab } from '@/features/_config/slots'

export type NavGroup = 'preferences' | 'account'

// Plugins are excluded: they now run server-side (backend /api/v1/plugins) so
// the management UI is reachable from the browser, not just the Electron app.
export const DESKTOP_SECTIONS = new Set(['library', 'desktop'])

export interface NavItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  desktop: boolean
  requiresAuth: boolean
  /** Visible only to signed-in admins (server storage & admin tooling) */
  adminOnly?: boolean
  group: NavGroup
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, desktop: false, requiresAuth: false, group: 'preferences' },
  { id: 'appearance', label: 'Appearance', icon: Palette, desktop: false, requiresAuth: false, group: 'preferences' },
  { id: 'general', label: 'General', icon: Settings, desktop: false, requiresAuth: false, group: 'preferences' },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
  },
  { id: 'desktop', label: 'Desktop', icon: Monitor, desktop: true, requiresAuth: false, group: 'preferences' },
  { id: 'launcher', label: 'Launcher', icon: Gamepad2, desktop: false, requiresAuth: false, group: 'preferences' },
  { id: 'downloads', label: 'Downloads', icon: Download, desktop: false, requiresAuth: false, group: 'preferences' },
  { id: 'library', label: 'Library', icon: HardDrive, desktop: true, requiresAuth: false, group: 'preferences' },
  { id: 'integrations', label: 'Integrations', icon: Link2, desktop: false, requiresAuth: false, group: 'preferences' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, desktop: true, requiresAuth: false, group: 'preferences' },

  // Personal Account & Governance (Requires Auth)
  { id: 'profile', label: 'Profile', icon: User, desktop: false, requiresAuth: true, group: 'account' },
  { id: 'account', label: 'Security', icon: Shield, desktop: false, requiresAuth: true, group: 'account' },
  { id: 'proposals', label: 'Proposals', icon: Shield, desktop: true, requiresAuth: true, group: 'account' },
  {
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    desktop: false,
    requiresAuth: true,
    adminOnly: true,
    group: 'account',
  },
]

export function getNavItems(pluginTabs?: PluginSettingsTab[]): NavItem[] {
  const pluginItems: NavItem[] = (pluginTabs || []).map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: getIconByName(tab.icon),
    desktop: true,
    requiresAuth: true,
    group: 'account' as NavGroup,
  }))

  const pluginsIdx = NAV_ITEMS.findIndex((item) => item.id === 'plugins')
  const result = [...NAV_ITEMS]
  if (pluginsIdx >= 0) {
    result.splice(pluginsIdx, 0, ...pluginItems)
  }
  return result
}

function getIconByName(name: string): ComponentType<{ className?: string }> {
  const icons: Record<string, ComponentType<{ className?: string }>> = {
    'gamepad-2': Gamepad2,
    puzzle: Puzzle,
    shuffle: Shuffle,
    download: Download,
    monitor: Monitor,
  }
  return icons[name] || Puzzle
}
