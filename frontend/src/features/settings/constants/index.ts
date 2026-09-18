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
  Shuffle,
  HardDrive,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { PluginSettingsTab } from '@/features/_config/slots'

export type NavGroup = 'preferences' | 'library' | 'connections' | 'account' | 'admin'

export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'library', label: 'Library' },
  { id: 'connections', label: 'Connections' },
  { id: 'account', label: 'Account' },
  { id: 'admin', label: 'Admin' },
]

/** Sections that require local desktop APIs and hide from the web sidebar. */
export const DESKTOP_SECTIONS = new Set<string>()

export const SETTINGS_LAST_SECTION_KEY = 'otix:settings-last-section'
export const DEFAULT_SETTINGS_SECTION = 'appearance'

export interface NavItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  desktop: boolean
  requiresAuth: boolean
  /** Visible only to signed-in admins (server storage & admin tooling) */
  adminOnly?: boolean
  group: NavGroup
  /** Extra terms for the settings sidebar search. */
  keywords?: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'theme accent motion shader sidebar landing cache about general desktop tray startup',
  },
  {
    id: 'launcher',
    label: 'Launcher',
    icon: Gamepad2,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'launcher theme layout modern xbox playstation switch forge glass minimal carousel animations transitions controller editions',
  },
  {
    id: 'desktop',
    label: 'Desktop',
    icon: Monitor,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'desktop tray startup minimize close always on top window node native',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'sound quiet hours push desktop chime alerts',
  },
  {
    id: 'library',
    label: 'Library',
    icon: HardDrive,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'scan folders matching proposals metadata games',
  },
  {
    id: 'downloads',
    label: 'Downloads',
    icon: Download,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'paths organizer game servers folders history',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Link2,
    desktop: false,
    requiresAuth: false,
    group: 'connections',
    keywords: 'integrations steam plex tmdb youtube sabnzbd prowlarr radarr sonarr usenet oauth',
  },
  {
    id: 'plugins',
    label: 'Plugins',
    icon: Puzzle,
    desktop: false,
    requiresAuth: false,
    group: 'connections',
    keywords: 'extensions marketplace install',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    desktop: false,
    requiresAuth: true,
    group: 'account',
    keywords: 'avatar cover bio privacy maturity',
  },
  {
    id: 'account',
    label: 'Security',
    icon: Shield,
    desktop: false,
    requiresAuth: true,
    group: 'account',
    keywords: 'email username 2fa sessions password verification',
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: HardDrive,
    desktop: false,
    requiresAuth: true,
    adminOnly: true,
    group: 'admin',
    keywords: 'disk artwork mirroring sweep admin',
  },
]

export function getNavItems(pluginTabs?: PluginSettingsTab[]): NavItem[] {
  const pluginItems: NavItem[] = (pluginTabs || []).map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: getIconByName(tab.icon),
    desktop: false,
    requiresAuth: true,
    group: 'connections' as NavGroup,
    keywords: 'plugin',
  }))

  const pluginsIdx = NAV_ITEMS.findIndex((item) => item.id === 'plugins')
  const result = [...NAV_ITEMS]
  if (pluginsIdx >= 0) {
    result.splice(pluginsIdx, 0, ...pluginItems)
  }
  return result
}

export function matchNavItem(item: NavItem, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase().trim()
  return (
    item.label.toLowerCase().includes(q) ||
    item.id.toLowerCase().includes(q) ||
    (item.keywords || '').toLowerCase().includes(q)
  )
}

export function getLastSettingsSection(allowedIds?: Set<string>): string {
  try {
    const stored = localStorage.getItem(SETTINGS_LAST_SECTION_KEY)
    if (stored && (!allowedIds || allowedIds.has(stored))) return stored
    if (stored && NAV_ITEMS.some((i) => i.id === stored) && !allowedIds) return stored
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS_SECTION
}

export function rememberSettingsSection(id: string) {
  if (!id || id === 'overview' || id === 'general' || id === 'integrations' || id === 'proposals') {
    return
  }
  try {
    localStorage.setItem(SETTINGS_LAST_SECTION_KEY, id)
  } catch {
    // ignore
  }
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
