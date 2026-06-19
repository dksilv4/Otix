import { User, Palette, Shield, Bell, Link2, Download, Gamepad2, Monitor, Puzzle } from 'lucide-react'
import type { ComponentType } from 'react'

export const DESKTOP_SECTIONS = new Set(['library', 'downloads', 'desktop', 'plugins'])

export interface NavItem {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  desktop: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: User, desktop: false },
  { id: 'account', label: 'Security', icon: Shield, desktop: false },
  { id: 'appearance', label: 'Appearance', icon: Palette, desktop: false },
  { id: 'notifications', label: 'Notifications', icon: Bell, desktop: false },
  { id: 'integrations', label: 'Integrations', icon: Link2, desktop: false },
  { id: 'library', label: 'Library', icon: Gamepad2, desktop: true },
  { id: 'downloads', label: 'Downloads', icon: Download, desktop: true },
  { id: 'desktop', label: 'Desktop', icon: Monitor, desktop: true },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, desktop: true },
]
