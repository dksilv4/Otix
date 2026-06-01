import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, Search, Sparkles, Trophy, Layers } from 'lucide-react'
import { userQueries, useClaimBadge } from '../user-queries'
import type { BadgeDef } from '../user-queries'
import { BadgeRenderer } from '../molecules/badge-renderer'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth/auth-provider'

// Define the 8 progressive series mapping achievement keys in order
const SERIES_DEFINITIONS = [
  {
    id: 'reviews',
    title: 'Reviews & Criticism',
    badgeKeys: ['first_review', 'reviews_5', 'reviews_10', 'reviews_25', 'reviews_50', 'reviews_100', 'reviews_250', 'reviews_500', 'reviews_1000'],
  },
  {
    id: 'interactions',
    title: 'Media Tracking',
    badgeKeys: ['interactions_10', 'interactions_50', 'interactions_100', 'interactions_250', 'interactions_500', 'interactions_1000', 'interactions_2000', 'interactions_5000', 'interactions_10000'],
  },
  {
    id: 'lists',
    title: 'Collection Lists',
    badgeKeys: ['lists_1', 'lists_5', 'lists_10', 'lists_25', 'lists_50', 'lists_100', 'lists_250', 'lists_500'],
  },
  {
    id: 'workouts',
    title: 'Fitness Logging',
    badgeKeys: ['workouts_1', 'workouts_10', 'workouts_25', 'workouts_50', 'workouts_100', 'workouts_200', 'workouts_500', 'workouts_1000'],
  },
  {
    id: 'levels',
    title: 'XP Levels',
    badgeKeys: ['level_2', 'level_5', 'level_10', 'level_20', 'level_35', 'level_50', 'level_75', 'level_100'],
  },
  {
    id: 'streaks',
    title: 'Activity Streaks',
    badgeKeys: ['streak_3', 'streak_7', 'streak_30', 'streak_100'],
  },
  {
    id: 'friends',
    title: 'Social Connections',
    badgeKeys: ['first_friend', 'friends_5', 'friends_20'],
  },
  {
    id: 'special',
    title: 'Special Milestones',
    badgeKeys: ['perfect_10'],
  },
]

interface StackedSeries {
  seriesId: string
  title: string
  activeBadge: BadgeDef
  nextBadge: BadgeDef | null
  unlockedCount: number
  totalCount: number
  isCompleted: boolean
}

export function ProfileAchievementsSection({ username }: { username: string }) {
  const { user: currentUser } = useAuth()
  const isOwnProfile = currentUser?.username === username
  const claimBadgeMutation = useClaimBadge(username)

  const badgesQuery = useQuery(userQueries.badges(username))
  const [filterStatus, setFilterStatus] = useState<'all' | 'unlocked' | 'locked'>('all')
  const [filterTier, setFilterTier] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupSeries, setGroupSeries] = useState(true)

  const achievements = badgesQuery.data ?? []

  // Stats computation
  const stats = useMemo(() => {
    if (!achievements.length) return { earnedCount: 0, totalCount: 0, percent: 0 }
    const earnedCount = achievements.filter((b) => b.earned).length
    const totalCount = achievements.length
    const percent = Math.round((earnedCount / totalCount) * 100)
    return { earnedCount, totalCount, percent }
  }, [achievements])

  // Group achievements into stacked series
  const stackedSeriesData = useMemo(() => {
    if (!achievements.length) return []

    const results: StackedSeries[] = []

    for (const def of SERIES_DEFINITIONS) {
      // Find all badges belonging to this series
      const matched = def.badgeKeys
        .map((key) => achievements.find((b) => b.badgeKey === key))
        .filter((b): b is BadgeDef => !!b)

      if (matched.length === 0) continue

      const earnedBadges = matched.filter((b) => b.earned)
      const lockedBadges = matched.filter((b) => !b.earned)
      
      const unlockedCount = earnedBadges.length
      const totalCount = matched.length
      const isCompleted = unlockedCount === totalCount

      let activeBadge: BadgeDef
      let nextBadge: BadgeDef | null = null

      const earnedUnclaimed = earnedBadges.filter((b) => !b.claimed)

      if (earnedUnclaimed.length > 0) {
        activeBadge = earnedUnclaimed[0]
        nextBadge = lockedBadges[0] || null
      } else if (isCompleted) {
        activeBadge = matched[matched.length - 1]
        nextBadge = null
      } else if (unlockedCount > 0) {
        activeBadge = earnedBadges[earnedBadges.length - 1]
        nextBadge = lockedBadges[0]
      } else {
        activeBadge = matched[0]
        nextBadge = matched[0]
      }

      results.push({
        seriesId: def.id,
        title: def.title,
        activeBadge,
        nextBadge,
        unlockedCount,
        totalCount,
        isCompleted,
      })
    }

    return results
  }, [achievements])

  // Filtered achievements (when groupSeries is false)
  const filteredUnstacked = useMemo(() => {
    return achievements.filter((b) => {
      if (filterStatus === 'unlocked' && !b.earned) return false
      if (filterStatus === 'locked' && b.earned) return false
      if (filterTier !== 'all' && b.tier !== filterTier) return false
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase()
        if (!b.label.toLowerCase().includes(query) && !b.description.toLowerCase().includes(query)) return false
      }
      return true
    })
  }, [achievements, filterStatus, filterTier, searchQuery])

  // Filtered stacked series (when groupSeries is true)
  const filteredStacked = useMemo(() => {
    return stackedSeriesData.filter((s) => {
      // Status filter
      if (filterStatus === 'unlocked' && s.unlockedCount === 0) return false
      if (filterStatus === 'locked' && s.isCompleted) return false

      // Tier filter applies to the display active badge
      if (filterTier !== 'all' && s.activeBadge.tier !== filterTier) return false

      // Search applies to series title, or active badge name/description
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase()
        const titleMatch = s.title.toLowerCase().includes(query)
        const labelMatch = s.activeBadge.label.toLowerCase().includes(query)
        const descMatch = s.activeBadge.description.toLowerCase().includes(query)
        if (!titleMatch && !labelMatch && !descMatch) return false
      }

      return true
    })
  }, [stackedSeriesData, filterStatus, filterTier, searchQuery])

  if (badgesQuery.isLoading) return <AchievementsSkeleton />
  if (badgesQuery.isError || achievements.length === 0) return null

  return (
    <section className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground/60" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Achievements</h2>
        </div>

        {/* Mini progress tracker */}
        <div className="flex items-center gap-3 bg-[var(--dk-surface-base)] px-4 py-2 rounded-2xl shadow-[var(--dk-shadow-sm)] border border-white/[0.02]">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold tabular-nums text-foreground/80">
            {stats.earnedCount} / {stats.totalCount} unlocked
          </span>
          <div className="w-16 sm:w-24 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground/50 font-bold tabular-nums">
            {stats.percent}%
          </span>
        </div>
      </div>

      {/* Filters & Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[var(--dk-surface-base)] p-3 rounded-2xl border border-white/[0.01] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/45" />
            <input
              type="text"
              placeholder="Search achievements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--dk-surface-overlay)] rounded-xl pl-9 pr-4 py-2 text-xs text-foreground/90 border-0 placeholder-muted-foreground/40 shadow-inner focus:outline-none transition-all"
            />
          </div>

          {/* Group Series Toggler */}
          <button
            onClick={() => setGroupSeries(!groupSeries)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold select-none border transition-all ${
              groupSeries
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-[var(--dk-surface-overlay)] border-transparent text-muted-foreground/60 hover:text-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Group Series
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Status Selectors */}
          <div className="flex rounded-xl bg-white/[0.03] p-0.5 border border-white/[0.01]">
            {(['all', 'unlocked', 'locked'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-lg capitalize transition-all ${
                  filterStatus === status
                    ? 'bg-[var(--dk-surface-overlay)] text-foreground shadow-sm'
                    : 'text-muted-foreground/50 hover:text-foreground'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Tier Selectors */}
          <div className="flex rounded-xl bg-white/[0.03] p-0.5 border border-white/[0.01]">
            {['all', 'bronze', 'silver', 'gold', 'platinum', 'special'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg capitalize transition-all ${
                  filterTier === t
                    ? 'bg-[var(--dk-surface-overlay)] text-foreground shadow-sm'
                    : 'text-muted-foreground/50 hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stacked Series View */}
      {groupSeries ? (
        filteredStacked.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/[0.04] bg-[var(--dk-surface-glass)] p-10 text-center">
            <Award className="h-6 w-6 text-muted-foreground/25 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground/50 font-medium">No matching series found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStacked.map((series) => {
              const active = series.activeBadge
              const next = series.nextBadge
              const isEarned = active.earned
              const unlockedDate = active.earnedAt
                ? new Date(active.earnedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null

              return (
                <div
                  key={series.seriesId}
                  className={`relative flex items-center gap-5 rounded-3xl p-5 bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] border border-white/[0.01] hover:bg-[var(--dk-surface-glass-hover)] hover:scale-[1.01] transition-all duration-300 group ${
                    isEarned ? 'opacity-100' : 'opacity-70'
                  }`}
                >
                  {/* Left: Badge Graphic */}
                  <div className="shrink-0">
                    <BadgeRenderer
                      badgeKey={active.badgeKey}
                      icon={active.icon}
                      tier={active.tier}
                      earned={isEarned}
                      size="md"
                    />
                  </div>

                  {/* Right: Progression details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      {/* Series Header & Tier count */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/45">
                          {series.title}
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">
                          {series.unlockedCount} / {series.totalCount} Tiers
                        </span>
                      </div>

                      {/* Display Badge Details */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-extrabold text-sm text-foreground/90 truncate group-hover:text-foreground">
                          {active.label}
                        </span>
                        <span
                          className={`text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                            {
                              bronze: 'bg-[#cd7f32]/10 text-[#ff9c47]',
                              silver: 'bg-[#a8b2c1]/10 text-[#cbd5e1]',
                              gold: 'bg-[#f0b90b]/10 text-[#fcd34d]',
                              platinum: 'bg-[#55c0e0]/10 text-[#a5f3fc]',
                              special: 'bg-[#e8326e]/10 text-[#fda4af]',
                            }[active.tier]
                          }`}
                        >
                          {active.tier}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 mt-1 leading-normal line-clamp-1">
                        {active.description}
                      </p>
                    </div>

                    {/* cumulative progression details */}
                    <div className="mt-3 pt-3 border-t border-white/[0.03]">
                      {isOwnProfile && active.earned && !active.claimed ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Reward Ready
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              claimBadgeMutation.mutate(active.badgeKey)
                            }}
                            disabled={claimBadgeMutation.isPending}
                            className="relative flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-[10px] font-extrabold tracking-wider uppercase overflow-hidden transition-all duration-300 transform hover:scale-105 active:scale-95 text-white bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-600 hover:to-rose-600 shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-50 select-none cursor-pointer"
                          >
                            {claimBadgeMutation.isPending && claimBadgeMutation.variables === active.badgeKey ? 'Claiming...' : `Claim +${active.xpReward} XP`}
                          </button>
                        </div>
                      ) : series.isCompleted ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                          <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">
                            Series Completed
                          </span>
                          {unlockedDate && (
                            <span className="text-[9px] text-muted-foreground/35 ml-auto">
                              Completed {unlockedDate}
                            </span>
                          )}
                        </div>
                      ) : next ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground/50">
                              Next: <span className="font-semibold text-foreground/80">{next.label}</span>
                            </span>
                            <span className="font-semibold text-muted-foreground/60 tabular-nums">
                              {Math.round(next.currentValue)} / {Math.round(next.targetValue)}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-300/80 transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (next.currentValue / next.targetValue) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        /* Unstacked Grid View (original unstacked grid of all matching 50 achievements) */
        filteredUnstacked.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/[0.04] bg-[var(--dk-surface-glass)] p-10 text-center">
            <Award className="h-6 w-6 text-muted-foreground/25 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground/50 font-medium">No matching achievements found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnstacked.map((badge) => {
              const unlockedDate = badge.earnedAt
                ? new Date(badge.earnedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null

              return (
                <div
                  key={badge.badgeKey}
                  className={`relative flex items-center gap-4 rounded-2xl p-4 bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] border border-white/[0.01] hover:bg-[var(--dk-surface-glass-hover)] hover:scale-[1.01] transition-all duration-300 group ${
                    badge.earned ? 'opacity-100' : 'opacity-70'
                  }`}
                >
                  <div className="shrink-0">
                    <BadgeRenderer
                      badgeKey={badge.badgeKey}
                      icon={badge.icon}
                      tier={badge.tier}
                      earned={badge.earned}
                      size="md"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground/90 truncate group-hover:text-foreground">
                        {badge.label}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                          {
                            bronze: 'bg-[#cd7f32]/10 text-[#ff9c47]',
                            silver: 'bg-[#a8b2c1]/10 text-[#cbd5e1]',
                            gold: 'bg-[#f0b90b]/10 text-[#fcd34d]',
                            platinum: 'bg-[#55c0e0]/10 text-[#a5f3fc]',
                            special: 'bg-[#e8326e]/10 text-[#fda4af]',
                          }[badge.tier]
                        }`}
                      >
                        {badge.tier}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 mt-1 leading-normal line-clamp-2">
                      {badge.description}
                    </p>
                    {unlockedDate ? (
                      isOwnProfile && !badge.claimed ? (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/[0.03]">
                          <span className="text-[9px] text-muted-foreground/50 font-medium">
                            Unlocked {unlockedDate}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              claimBadgeMutation.mutate(badge.badgeKey)
                            }}
                            disabled={claimBadgeMutation.isPending}
                            className="relative flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-extrabold tracking-wider uppercase transition-all duration-300 transform hover:scale-105 active:scale-95 text-white bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-600 hover:to-rose-600 shadow-[0_0_10px_rgba(245,158,11,0.2)] disabled:opacity-50 select-none cursor-pointer"
                          >
                            {claimBadgeMutation.isPending && claimBadgeMutation.variables === badge.badgeKey ? 'Claiming...' : `Claim +${badge.xpReward} XP`}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/45 mt-2">
                          <Clock className="h-3 w-3" />
                          <span>Unlocked {unlockedDate}</span>
                          {badge.claimed && (
                            <span className="text-[9px] font-bold text-emerald-400/80 ml-auto flex items-center gap-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Claimed
                            </span>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="mt-2.5 space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground/40 font-semibold">
                          <span>Locked</span>
                          {badge.targetValue > 0 && (
                            <span className="tabular-nums">
                              {Math.round(badge.currentValue)} / {Math.round(badge.targetValue)}
                            </span>
                          )}
                        </div>
                        {badge.targetValue > 0 && (
                          <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-muted-foreground/35 transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (badge.currentValue / badge.targetValue) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </section>
  )
}

function Clock({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  )
}

function AchievementsSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-44 rounded-2xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <Skeleton className="h-8 w-60 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 bg-[var(--dk-surface-base)] rounded-2xl shadow-sm border border-white/[0.01]">
            <Skeleton className="w-20 h-20 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
