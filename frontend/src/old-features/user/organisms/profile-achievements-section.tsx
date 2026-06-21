// TODO: Review this file
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Award, Search, Sparkles, Trophy, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { userQueries, useClaimBadge } from '../user-queries'
import type { BadgeDef } from '../user-queries'
import { BadgeRenderer } from '../molecules/badge-renderer'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/lib/providers/auth'
import './profile-achievements-section.scss'

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
    <section className="dk-user-achievements">
      {/* Section Header */}
      <div className="dk-user-achievements__header">
        <div className="dk-user-achievements__header-title">
          <Trophy className="h-4 w-4 text-muted-foreground/60" />
          <h2 className="dk-user-achievements__header-heading">Achievements</h2>
        </div>

        {/* Mini progress tracker */}
        <div className="dk-user-achievements__progress">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span className="dk-user-achievements__progress-count">
            {stats.earnedCount} / {stats.totalCount} unlocked
          </span>
          <div className="dk-user-achievements__progress-bar">
            <div
              className="dk-user-achievements__progress-fill"
              style={{ width: `${stats.percent}%` }}
            />
          </div>
          <span className="dk-user-achievements__progress-percent">
            {stats.percent}%
          </span>
        </div>
      </div>

      {/* Filters & Control Bar */}
      <div className="dk-user-achievements__filters">
        <div className="dk-user-achievements__filters-inner">
          {/* Search */}
          <div className="dk-user-achievements__search">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/45" />
            <input
              type="text"
              placeholder="Search achievements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dk-user-achievements__search-input"
            />
          </div>

          {/* Group Series Toggler */}
          <button
            onClick={() => setGroupSeries(!groupSeries)}
            className={cn(
              'dk-user-achievements__toggle',
              groupSeries && 'dk-user-achievements__toggle--active'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Group Series
          </button>
        </div>

        {/* Filter Pills */}
        <div className="dk-user-achievements__filters-pills">
          {/* Status Selectors */}
          <div className="dk-user-achievements__pill-group">
            {(['all', 'unlocked', 'locked'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  'dk-user-achievements__pill',
                  filterStatus === status && 'dk-user-achievements__pill--active'
                )}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Tier Selectors */}
          <div className="dk-user-achievements__pill-group">
            {['all', 'bronze', 'silver', 'gold', 'platinum', 'special'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={cn(
                  'dk-user-achievements__pill',
                  'dk-user-achievements__pill--compact',
                  filterTier === t && 'dk-user-achievements__pill--active'
                )}
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
          <div className="dk-user-achievements__empty">
            <Award className="h-6 w-6 text-muted-foreground/25 mx-auto mb-2" />
            <p className="dk-user-achievements__empty-text">No matching series found.</p>
          </div>
        ) : (
          <div className="dk-user-achievements__grid dk-user-achievements__grid--series">
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
                  className={cn(
                    'dk-user-achievements__card',
                    !isEarned && 'dk-user-achievements__card--locked'
                  )}
                >
                  {/* Left: Badge Graphic */}
                  <div className="dk-user-achievements__card-icon">
                    <BadgeRenderer
                      badgeKey={active.badgeKey}
                      icon={active.icon}
                      tier={active.tier}
                      earned={isEarned}
                      size="md"
                    />
                  </div>

                  {/* Right: Progression details */}
                  <div className="dk-user-achievements__card-body dk-user-achievements__card-body--series">
                    <div>
                      {/* Series Header & Tier count */}
                      <div className="dk-user-achievements__card-header">
                        <span className="dk-user-achievements__card-title">
                          {series.title}
                        </span>
                        <span className="dk-user-achievements__card-count">
                          {series.unlockedCount} / {series.totalCount} Tiers
                        </span>
                      </div>

                      {/* Display Badge Details */}
                      <div className="dk-user-achievements__card-badge-row">
                        <span className="dk-user-achievements__card-name">
                          {active.label}
                        </span>
                        <span
                          className={cn(
                            'dk-user-achievements__card-tag',
                            `dk-user-achievements__card-tag--${active.tier}`
                          )}
                        >
                          {active.tier}
                        </span>
                      </div>
                      <p className="dk-user-achievements__card-desc">
                        {active.description}
                      </p>
                    </div>

                    {/* cumulative progression details */}
                    <div className="dk-user-achievements__card-footer">
                      {isOwnProfile && active.earned && !active.claimed ? (
                        <div className="dk-user-achievements__reward">
                          <span className="dk-user-achievements__reward-text">
                            <Sparkles className="h-3 w-3" /> Reward Ready
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              claimBadgeMutation.mutate(active.badgeKey)
                            }}
                            disabled={claimBadgeMutation.isPending}
                            className="dk-user-achievements__claim-btn"
                          >
                            {claimBadgeMutation.isPending && claimBadgeMutation.variables === active.badgeKey ? 'Claiming...' : `Claim +${active.xpReward} XP`}
                          </button>
                        </div>
                      ) : series.isCompleted ? (
                        <div className="dk-user-achievements__completed">
                          <span className="dk-user-achievements__completed-dot" />
                          <span className="dk-user-achievements__completed-text">
                            Series Completed
                          </span>
                          {unlockedDate && (
                            <span className="dk-user-achievements__completed-date">
                              Completed {unlockedDate}
                            </span>
                          )}
                        </div>
                      ) : next ? (
                        <div className="dk-user-achievements__next">
                          <div className="dk-user-achievements__next-row">
                            <span className="dk-user-achievements__next-label">
                              Next: <span className="dk-user-achievements__next-name">{next.label}</span>
                            </span>
                            <span className="dk-user-achievements__next-value">
                              {Math.round(next.currentValue)} / {Math.round(next.targetValue)}
                            </span>
                          </div>
                          <div className="dk-user-achievements__next-bar">
                            <div
                              className="dk-user-achievements__next-fill"
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
          <div className="dk-user-achievements__empty">
            <Award className="h-6 w-6 text-muted-foreground/25 mx-auto mb-2" />
            <p className="dk-user-achievements__empty-text">No matching achievements found.</p>
          </div>
        ) : (
          <div className="dk-user-achievements__grid dk-user-achievements__grid--badges">
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
                  className={cn(
                    'dk-user-achievements__card',
                    'dk-user-achievements__card--badge',
                    !badge.earned && 'dk-user-achievements__card--locked'
                  )}
                >
                  <div className="dk-user-achievements__card-icon">
                    <BadgeRenderer
                      badgeKey={badge.badgeKey}
                      icon={badge.icon}
                      tier={badge.tier}
                      earned={badge.earned}
                      size="md"
                    />
                  </div>

                  <div className="dk-user-achievements__card-body">
                    <div className="dk-user-achievements__card-badge-row">
                      <span className="dk-user-achievements__card-name">
                        {badge.label}
                      </span>
                      <span
                        className={cn(
                          'dk-user-achievements__card-tag',
                          `dk-user-achievements__card-tag--${badge.tier}`
                        )}
                      >
                        {badge.tier}
                      </span>
                    </div>
                    <p className="dk-user-achievements__card-desc dk-user-achievements__card-desc--compact">
                      {badge.description}
                    </p>
                    {unlockedDate ? (
                      isOwnProfile && !badge.claimed ? (
                        <div className="dk-user-achievements__unlock-info">
                          <span className="dk-user-achievements__unlock-date">
                            Unlocked {unlockedDate}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              claimBadgeMutation.mutate(badge.badgeKey)
                            }}
                            disabled={claimBadgeMutation.isPending}
                            className="dk-user-achievements__claim-btn dk-user-achievements__claim-btn--compact"
                          >
                            {claimBadgeMutation.isPending && claimBadgeMutation.variables === badge.badgeKey ? 'Claiming...' : `Claim +${badge.xpReward} XP`}
                          </button>
                        </div>
                      ) : (
                        <div className="dk-user-achievements__unlock-info">
                          <Clock className="h-3 w-3" />
                          <span>Unlocked {unlockedDate}</span>
                          {badge.claimed && (
                            <span className="dk-user-achievements__claimed-badge">
                              <span className="dk-user-achievements__claimed-dot" />
                              Claimed
                            </span>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="dk-user-achievements__locked">
                        <div className="dk-user-achievements__locked-row">
                          <span>Locked</span>
                          {badge.targetValue > 0 && (
                            <span className="dk-user-achievements__locked-value">
                              {Math.round(badge.currentValue)} / {Math.round(badge.targetValue)}
                            </span>
                          )}
                        </div>
                        {badge.targetValue > 0 && (
                          <div className="dk-user-achievements__locked-bar">
                            <div
                              className="dk-user-achievements__locked-fill"
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
    <section className="dk-user-achievements__skeleton">
      <div className="dk-user-achievements__skeleton-header">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-44 rounded-2xl" />
      </div>
      <div className="dk-user-achievements__skeleton-filters">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <Skeleton className="h-8 w-60 rounded-2xl" />
      </div>
      <div className="dk-user-achievements__skeleton-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="dk-user-achievements__skeleton-card">
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
