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
  Server,
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

/** Previously desktop-only section ids. Empty now that Otix nodes cover those settings on web. */
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
  /** Small status chips shown beside the nav label (e.g. Beta). */
  badges?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'theme accent motion shader sidebar landing cache about general taste recommendations for you',
  },
  {
    id: 'launcher',
    label: 'Launcher',
    icon: Gamepad2,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    badges: ['Beta'],
    keywords: 'launcher theme layout modern xbox playstation switch forge glass minimal carousel animations transitions controller editions beta',
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
    keywords: 'overview scan folders matching proposals metadata games catalog',
  },
  {
    id: 'nodes',
    label: 'Nodes',
    icon: Server,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'desktop tray startup minimize close always on top window node native servers nas share remote worker machine paths folders organize downloaders sabnzbd scan',
  },
  {
    id: 'game-servers',
    label: 'Game Servers',
    icon: Gamepad2,
    desktop: false,
    requiresAuth: true,
    adminOnly: false,
    group: 'library',
    badges: ['Beta', 'WIP'],
    keywords: 'dedicated game servers multiplayer host connect valheim minecraft cs2 rust palworld join share steam beta',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Link2,
    desktop: false,
    requiresAuth: false,
    group: 'connections',
    keywords: 'integrations steam plex tmdb youtube sabnzbd prowlarr radarr sonarr usenet oauth connection nodes accounts',
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
    if (stored === 'desktop') return 'nodes'
    if (stored && (!allowedIds || allowedIds.has(stored))) return stored
    if (stored && NAV_ITEMS.some((i) => i.id === stored) && !allowedIds) return stored
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS_SECTION
}

export function rememberSettingsSection(id: string) {
  if (id === 'desktop') id = 'nodes'
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
    server: Server,
  }
  return icons[name] || Puzzle
}
