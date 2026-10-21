import { useQuery } from '@tanstack/react-query'
import { PieChart, Film, Tv, Gamepad2, Music } from 'lucide-react'
import { userQueries } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileLibraryBreakdownProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
}

export const UserProfileLibraryBreakdown = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
}: UserProfileLibraryBreakdownProps) => {
  const query = useQuery(userQueries.libraryStats(username))
  const stats = query.data

  const mediaTypes = [
    { key: 'movie', label: 'Movies', icon: Film, count: stats?.byMediaType?.movie ?? 0 },
    { key: 'show', label: 'Shows', icon: Tv, count: stats?.byMediaType?.show ?? 0 },
    { key: 'game', label: 'Games', icon: Gamepad2, count: stats?.byMediaType?.game ?? 0 },
    { key: 'music', label: 'Music', icon: Music, count: stats?.byMediaType?.music ?? 0 },
  ]

  const total = mediaTypes.reduce((sum, m) => sum + m.count, 0)
  const summary = total > 0 ? `${total} items tracked` : undefined

  return (
    <div data-testid="user-profile-library-breakdown" className="w-full space-y-4">
      <SectionHeader
        icon={PieChart}
        title="Library Breakdown"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        <div className="p-4 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {mediaTypes.map((item) => {
              const Icon = item.icon
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0

              return (
                <div
                  key={item.key}
                  className="p-3 rounded-xl bg-[var(--dk-surface-ghost)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <span className="text-xs font-semibold block text-foreground">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {pct}% of library
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {item.count}
                  </span>
                </div>
              )
            })}
          </div>

          {stats?.completionRate != null && stats.completionRate > 0 && (
            <div className="pt-2 border-t border-[var(--dk-separator)] flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall Completion Rate</span>
              <span className="font-semibold text-foreground">
                {Math.round(stats.completionRate * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
