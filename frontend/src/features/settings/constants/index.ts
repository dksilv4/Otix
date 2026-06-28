import { User, Palette, Shield, Bell, Link2, Download, Gamepad2, Monitor, Puzzle } from 'lucide-react'
import type { ComponentType } from 'react'
import type { PluginSettingsTab } from '@/features/_config/slots'

export type NavGroup = 'general' | 'desktop'

export const DESKTOP_SECTIONS = new Set(['library', 'downloads', 'desktop', 'plugins'])

export interface NavItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  desktop: boolean
  group: NavGroup
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: User, desktop: false, group: 'general' },
  { id: 'account', label: 'Security', icon: Shield, desktop: false, group: 'general' },
  { id: 'appearance', label: 'Appearance', icon: Palette, desktop: false, group: 'general' },
  { id: 'notifications', label: 'Notifications', icon: Bell, desktop: false, group: 'general' },
  { id: 'integrations', label: 'Integrations', icon: Link2, desktop: false, group: 'general' },
  { id: 'library', label: 'Library', icon: Gamepad2, desktop: true, group: 'desktop' },
  { id: 'proposals', label: 'Proposals', icon: Shield, desktop: true, group: 'desktop' },
  { id: 'downloads', label: 'Downloads', icon: Download, desktop: true, group: 'desktop' },
  { id: 'desktop', label: 'Desktop', icon: Monitor, desktop: true, group: 'desktop' },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, desktop: true, group: 'desktop' },
]

export function getNavItems(pluginTabs?: PluginSettingsTab[]): NavItem[] {
  const pluginItems: NavItem[] = (pluginTabs || []).map(tab => ({
    id: tab.id,
    label: tab.label,
    icon: getIconByName(tab.icon),
    desktop: true,
    group: 'desktop' as NavGroup,
  }))

  const pluginsIdx = NAV_ITEMS.findIndex(item => item.id === 'plugins')
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
