import { useQuery } from '@tanstack/react-query'
import { BarChart3, MessageSquare, Sparkles, ListFilter, PlayCircle } from 'lucide-react'
import { userQueries } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileStatsProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
}

export const UserProfileStats = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
}: UserProfileStatsProps) => {
  const query = useQuery(userQueries.stats(username))
  const stats = query.data

  const statItems = [
    {
      label: 'Reviews',
      value: stats?.reviewCount ?? 0,
      icon: MessageSquare,
    },
    {
      label: 'Interactions',
      value: stats?.interactionCount ?? 0,
      icon: PlayCircle,
    },
    {
      label: 'Curated Lists',
      value: stats?.listCount ?? 0,
      icon: ListFilter,
    },
    {
      label: 'Total XP',
      value: (stats?.totalXp ?? 0).toLocaleString(),
      icon: Sparkles,
    },
  ]

  return (
    <div data-testid="user-profile-stats" className="w-full space-y-4">
      <SectionHeader
        icon={BarChart3}
        title="Overview Stats"
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="p-4 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    {item.label}
                  </span>
                  <Icon className="h-4 w-4 text-primary/70" />
                </div>
                <span className="text-xl font-bold text-foreground tabular-nums">
                  {query.isLoading ? '...' : item.value}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
