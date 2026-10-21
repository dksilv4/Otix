import type { LucideIcon } from 'lucide-react'
import {
  Gamepad2,
  Star,
  Trophy,
  BarChart3,
  Clock,
  PieChart,
  BarChart2,
  Crown,
  Activity,
  Heart,
  Calendar,
  Cpu,
  Globe,
  Users,
  Lock,
} from 'lucide-react'
import type { SectionVisibility } from '../types'

export interface ProfileSectionDefinition {
  id: string
  title: string
  description: string
  icon: LucideIcon
  defaultVisibility: SectionVisibility
}

export const ALL_PROFILE_SECTIONS: ProfileSectionDefinition[] = [
  {
    id: 'top_5',
    title: 'Top 5 Favorites',
    description: 'Your all-time top 5 favorite movies, shows, games, and albums',
    icon: Crown,
    defaultVisibility: 'public',
  },
  {
    id: 'activity_heatmap',
    title: 'Activity Heatmap',
    description: '52-week calendar of daily watch time, gaming, and reviews',
    icon: Calendar,
    defaultVisibility: 'public',
  },
  {
    id: 'hardware_rig',
    title: 'Hardware & Rig',
    description: 'Battle station specs, homelab nodes, and graphics telemetry',
    icon: Cpu,
    defaultVisibility: 'private',
  },
  {
    id: 'game_sessions',
    title: 'Game Sessions',
    description: 'Gaming telemetry, active games, and FPS performance',
    icon: Gamepad2,
    defaultVisibility: 'private',
  },
  {
    id: 'reviews',
    title: 'Reviews & Ratings',
    description: 'Published reviews, star ratings, and community thoughts',
    icon: Star,
    defaultVisibility: 'public',
  },
  {
    id: 'top_rated',
    title: 'Top Rated',
    description: 'Highest rated movies, shows, games, and music',
    icon: Heart,
    defaultVisibility: 'public',
  },
  {
    id: 'stats',
    title: 'Overview Stats',
    description: 'Counts of reviews, media completions, lists, and XP',
    icon: BarChart3,
    defaultVisibility: 'public',
  },
  {
    id: 'achievements',
    title: 'Achievements',
    description: 'Badges earned, level tiers, and platform milestones',
    icon: Trophy,
    defaultVisibility: 'public',
  },
  {
    id: 'recent_activity',
    title: 'Recent Activity',
    description: 'Timeline of recent ratings, check-ins, and media logs',
    icon: Clock,
    defaultVisibility: 'public',
  },
  {
    id: 'library_breakdown',
    title: 'Library Breakdown',
    description: 'Media distribution across movies, shows, and games',
    icon: PieChart,
    defaultVisibility: 'public',
  },
  {
    id: 'rating_distribution',
    title: 'Rating Distribution',
    description: 'Histogram distribution of your scores from 1 to 10',
    icon: BarChart2,
    defaultVisibility: 'public',
  },
  {
    id: 'mood_timeline',
    title: 'Mood Timeline',
    description: 'Daily emotional check-ins and reflection history',
    icon: Activity,
    defaultVisibility: 'public',
  },
  {
    id: 'hof_movie',
    title: 'Movie Hall of Fame',
    description: 'Curated all-time favorite feature films',
    icon: Crown,
    defaultVisibility: 'public',
  },
  {
    id: 'hof_show',
    title: 'Show Hall of Fame',
    description: 'Curated all-time favorite television series',
    icon: Crown,
    defaultVisibility: 'public',
  },
  {
    id: 'hof_game',
    title: 'Game Hall of Fame',
    description: 'Curated all-time favorite video games',
    icon: Crown,
    defaultVisibility: 'public',
  },
]

export const DEFAULT_SECTION_IDS: string[] = [
  'top_5',
  'activity_heatmap',
  'hardware_rig',
  'game_sessions',
  'reviews',
  'top_rated',
  'stats',
  'achievements',
  'recent_activity',
  'library_breakdown',
  'rating_distribution',
]

export const getSectionDefinition = (
  sectionId: string,
): ProfileSectionDefinition | undefined => {
  return ALL_PROFILE_SECTIONS.find((s) => s.id === sectionId)
}

export interface PrivacyOption {
  value: SectionVisibility
  label: string
  icon: LucideIcon
  tooltip: string
}

export const PRIVACY_OPTIONS: PrivacyOption[] = [
  {
    value: 'public',
    label: 'Public',
    icon: Globe,
    tooltip: 'Public to all visitors',
  },
  {
    value: 'friends',
    label: 'Friends',
    icon: Users,
    tooltip: 'Visible to friends only',
  },
  {
    value: 'private',
    label: 'Private',
    icon: Lock,
    tooltip: 'Private to you only',
  },
]

export const getNextSectionVisibility = (
  current: SectionVisibility,
): SectionVisibility => {
  switch (current) {
    case 'public':
      return 'friends'
    case 'friends':
      return 'private'
    case 'private':
    default:
      return 'public'
  }
}

export const resolveSectionVisibility = (
  sectionId: string,
  visibilityMap?: Record<string, SectionVisibility> | null,
): SectionVisibility => {
  if (visibilityMap && sectionId in visibilityMap) {
    const val = visibilityMap[sectionId]
    if (val === 'public' || val === 'friends' || val === 'private') {
      return val
    }
  }
  const def = getSectionDefinition(sectionId)
  return def ? def.defaultVisibility : 'public'
}

export const getHeatmapIntensityClass = (count: number): string => {
  if (count <= 0) return 'bg-[var(--dk-surface-ghost)]/60'
  if (count <= 2) return 'bg-primary/30'
  if (count <= 5) return 'bg-primary/60'
  if (count <= 8) return 'bg-primary/80'
  return 'bg-primary'
}

export const formatHardwareStorageBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 GB'
  const tb = bytes / (1024 * 1024 * 1024 * 1024)
  if (tb >= 1) return `${tb.toFixed(1)} TB`
  const gb = bytes / (1024 * 1024 * 1024)
  return `${Math.round(gb)} GB`
}
