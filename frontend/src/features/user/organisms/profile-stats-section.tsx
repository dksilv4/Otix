import { useQuery } from '@tanstack/react-query'
import { BarChart3, MessageSquareText, Heart, Dumbbell, List, Zap } from 'lucide-react'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'

const STAT_ITEMS = [
  { key: 'review_count', label: 'Reviews', icon: MessageSquareText },
  { key: 'interaction_count', label: 'Interactions', icon: Heart },
  { key: 'workout_count', label: 'Workouts', icon: Dumbbell },
  { key: 'list_count', label: 'Lists', icon: List },
] as const

export function StatsSection({ username }: { username: string }) {
  const statsQuery = useQuery(userQueries.stats(username))

  if (statsQuery.isLoading) return <StatsSkeleton />
  if (statsQuery.isError || !statsQuery.data) return null

  const stats = statsQuery.data

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity Stats</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_ITEMS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            className="rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]"
          >
            <Icon className="h-4 w-4 text-muted-foreground mb-2" />
            <p className="text-2xl font-bold tabular-nums">
              {(stats as Record<string, number>)[key] ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)] flex items-center gap-3">
        <Zap className="h-4 w-4 text-primary" />
        <div>
          <p className="text-xl font-bold tabular-nums">{stats.totalXp.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total XP</p>
        </div>
      </div>
    </section>
  )
}

function StatsSkeleton() {
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </section>
  )
}
