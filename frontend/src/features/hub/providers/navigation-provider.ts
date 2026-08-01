import type { ComponentType } from 'react'
import { Compass, Search, Library, Calendar, Bell, Settings } from 'lucide-react'
import { router } from '@/lib/router'
import type { Command, CommandProvider } from '../types'

type AppPath = '/' | '/search' | '/library' | '/calendar' | '/notifications' | '/settings'

interface NavEntry {
  id: string
  title: string
  to: AppPath
  icon: ComponentType<{ className?: string }>
  keywords?: string[]
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'discover', title: 'Discover', to: '/', icon: Compass, keywords: ['home', 'feed'] },
  { id: 'search', title: 'Search', to: '/search', icon: Search, keywords: ['find', 'lookup'] },
  { id: 'library', title: 'Library', to: '/library', icon: Library, keywords: ['collection'] },
  { id: 'calendar', title: 'Calendar', to: '/calendar', icon: Calendar, keywords: ['releases', 'schedule'] },
  { id: 'notifications', title: 'Notifications', to: '/notifications', icon: Bell, keywords: ['alerts'] },
  { id: 'settings', title: 'Settings', to: '/settings', icon: Settings, keywords: ['preferences'] },
]

export function createNavigationProvider(): CommandProvider {
  return {
    id: 'navigation',
    label: 'Navigation',
    domain: 'navigation',
    search: (query: string): Command[] => {
      const q = query.trim().toLowerCase()
      const list = q
        ? NAV_ENTRIES.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              (e.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
          )
        : NAV_ENTRIES

      return list.map((entry) => ({
        id: `nav:${entry.id}`,
        title: entry.title,
        icon: entry.icon,
        domain: 'navigation',
        keywords: entry.keywords,
        run: () => router.navigate({ to: entry.to }),
      }))
    },
  }
}
