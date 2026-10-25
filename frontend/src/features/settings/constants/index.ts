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
  SlidersHorizontal,
  Sparkles,
  FolderOpen,
  Wand2,
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
export const DEFAULT_SETTINGS_SECTION = 'general'

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
  /** True for standalone workspace pages with their own menu (e.g. Nodes) rather than simple settings form sections. */
  isPage?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    label: 'General',
    icon: SlidersHorizontal,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'defaults landing page cache wizard welcome about version client environment',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'theme light dark mode accent color motion shader quality background',
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    icon: Sparkles,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'for you taste reset blocked recommendations steam free packs dlc decide for me personalize discover',
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
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    desktop: false,
    requiresAuth: false,
    group: 'preferences',
    keywords: 'sound quiet hours push desktop chime alerts',
  },
  {
    id: 'organize',
    label: 'Organize',
    icon: Sparkles,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'organize folders naming templates presets iso rename structure rules wishlist repackers directory',
  },
  {
    id: 'paths',
    label: 'Paths',
    icon: FolderOpen,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'paths folders scan games iso download install directory storage nodes',
  },
  {
    id: 'nodes',
    label: 'Nodes',
    icon: Server,
    desktop: false,
    requiresAuth: true,
    adminOnly: false,
    group: 'library',
    isPage: true,
    keywords: 'otix nodes desktop tray startup minimize close always on top window node native servers nas share remote worker machine paths folders organize downloaders sabnzbd scan epic games store egs homelab server machines hard drives drives storage homes smb dedicated game servers multiplayer host connect valheim minecraft cs2 rust palworld join share steam',
  },
  {
    id: 'proposals',
    label: 'Match Proposals',
    icon: Wand2,
    desktop: false,
    requiresAuth: false,
    group: 'library',
    keywords: 'proposals matching candidates metadata steam igdb review titles games',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Link2,
    desktop: false,
    requiresAuth: false,
    group: 'connections',
    keywords: 'integrations steam plex tmdb youtube accounts oauth google google drive',
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
  if (!id || id === 'overview' || id === 'integrations' || id === 'proposals') {
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
