import type { ComponentType } from 'react'
import { Compass, Search, Library, Calendar, Bell, Settings, Sparkles } from 'lucide-react'
import { router } from '@/lib/router'
import { openDecideWatch } from '@/features/discover/open-decide-watch'
import type { Command, CommandProvider } from '../types'

type AppPath = '/' | '/search' | '/library' | '/calendar' | '/notifications' | '/settings' | '/welcome'

interface NavEntry {
  id: string
  title: string
  to: AppPath
  icon: ComponentType<{ className?: string }>
  keywords?: string[]
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'discover', title: 'Discover', to: '/', icon: Compass, keywords: ['home', 'feed'] },
  { id: 'welcome', title: 'Welcome Guide', to: '/welcome', icon: Sparkles, keywords: ['welcome', 'guide', 'tour', 'help', 'intro', 'onboarding'] },
  { id: 'search', title: 'Search', to: '/search', icon: Search, keywords: ['find', 'lookup'] },
  { id: 'library', title: 'Library', to: '/library', icon: Library, keywords: ['collection'] },
  { id: 'calendar', title: 'Calendar', to: '/calendar', icon: Calendar, keywords: ['releases', 'schedule'] },
  { id: 'notifications', title: 'Notifications', to: '/notifications', icon: Bell, keywords: ['alerts'] },
  { id: 'settings', title: 'Settings', to: '/settings', icon: Settings, keywords: ['preferences'] },
]

const DECIDE_KEYWORDS = ['decide', 'watch', 'pick', 'for you', 'recommend', 'tonight']

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

      const commands: Command[] = list.map((entry) => ({
        id: `nav:${entry.id}`,
        title: entry.title,
        icon: entry.icon,
        domain: 'navigation',
        keywords: entry.keywords,
        run: () => router.navigate({ to: entry.to }),
      }))

      const decideMatches =
        !q ||
        'decide for me'.includes(q) ||
        DECIDE_KEYWORDS.some((k) => k.includes(q) || q.includes(k))
      if (decideMatches) {
        commands.unshift({
          id: 'nav:decide-watch',
          title: 'Decide for me',
          subtitle: 'Pick something to watch',
          icon: Sparkles,
          domain: 'navigation',
          keywords: DECIDE_KEYWORDS,
          run: () => openDecideWatch(),
        })
      }

      return commands
    },
  }
}
