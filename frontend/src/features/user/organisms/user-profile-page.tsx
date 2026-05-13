import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CalendarDays, MessageSquareText, Star, UserPlus, UserCheck, Clock } from 'lucide-react'

import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { TmdbIcon } from '@/features/dk-ui/atoms/tmdb-icon'
import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { userQueries, computeReviewStats } from '../user-queries'

const GRADIENTS = [
  ['#0f0c29', '#302b63', '#24243e'],
  ['#1a1110', '#3b1c1a', '#5c1a2e'],
  ['#0a1a1a', '#1a3a3a', '#1a3a4a'],
  ['#141124', '#2d1b3a', '#1a2a4a'],
  ['#0d1b2a', '#1b2838', '#1a2a3a'],
  ['#1a1a2e', '#16213e', '#0f3460'],
]

function pickGradient(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  const [a, b, c] = GRADIENTS[Math.abs(hash) % GRADIENTS.length]
  return `linear-gradient(160deg, ${a} 0%, ${b} 50%, ${c} 100%)`
}

function formatJoinDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ── Gamification ──

interface UserGamification {
  level: number
  xp: number
  xpToNextLevel: number
  xpProgress: number // 0-1
}

function computeGamification(totalXp: number): UserGamification {
  const XP_PER_LEVEL = 300
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1
  const xpFloor = (level - 1) * XP_PER_LEVEL
  const xpCeil = level * XP_PER_LEVEL

  return {
    level,
    xp: totalXp,
    xpToNextLevel: xpCeil - xpFloor,
    xpProgress: Math.min(1, (totalXp - xpFloor) / (xpCeil - xpFloor)),
  }
}

// ── XP Progress Ring ──

function XPProgressRing({
  progress,
  size,
  strokeWidth = 3,
  children,
}: {
  progress: number
  size: number
  strokeWidth?: number
  children: React.ReactNode
}) {
  const radius = size / 2 - strokeWidth
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#xpGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="xpGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

// ── Page ──

export function UserProfilePage() {
  const params = useParams({ strict: false }) as { username?: string }
  const username = params.username || ''
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const profileQuery = useQuery(userQueries.profile(username))
  const reviewsQuery = useQuery(userQueries.reviews(username))

  const stats = useMemo(() => {
    if (!reviewsQuery.data) return null
    return computeReviewStats(reviewsQuery.data)
  }, [reviewsQuery.data])

  if (profileQuery.isLoading) return <ProfileSkeleton />
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-semibold">User Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The user "{username}" doesn't exist or has been removed.
          </p>
          <a href="/" className="inline-block text-sm text-primary hover:underline">
            Go back home
          </a>
        </div>
      </div>
    )
  }

  const profile = profileQuery.data
  const gamification = computeGamification(profile.totalXp)

  return (
    <div className="pb-16">
      <Helmet>
        <title>{`${profile.username} - Otix`}</title>
      </Helmet>

      {/* Hero */}
      <div className="relative flex min-h-[60vh] sm:min-h-[50vh] items-end overflow-hidden rounded-3xl shadow-[var(--dk-shadow-glass)]">
        {/* Backdrop */}
        {profile.backgroundUrl ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <img
              src={profile.backgroundUrl}
              alt=""
              className="h-full w-full object-cover object-[center_20%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 via-35% to-background/10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--primary)_0%,transparent_40%)] opacity-10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,var(--accent)_0%,transparent_40%)] opacity-10" />
          </div>
        ) : (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{ background: pickGradient(profile.username) }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 via-35% to-background/10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--primary)_0%,transparent_40%)] opacity-10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,var(--accent)_0%,transparent_40%)] opacity-10" />
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-8 pt-20 sm:px-6 sm:pb-10 lg:px-8">
          <div className="flex flex-row items-end gap-5 sm:gap-8">
            {/* Avatar with XP ring */}
            <div className="shrink-0">
              <XPProgressRing progress={gamification.xpProgress} size={120} strokeWidth={4}>
                <DkAvatar
                  src={profile.avatarUrl}
                  name={profile.username}
                  size="xl"
                  className="!h-20 !w-20 rounded-full ring-2 ring-background"
                />
              </XPProgressRing>
            </div>

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
              <h1
                className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}
              >
                {profile.username}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/55 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-white/40" />
                  Joined {formatJoinDate(profile.createdAt)}
                </span>
                <span aria-hidden className="text-white/15">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquareText className="h-3.5 w-3.5 text-white/40" />
                  {profile.reviewCount} review{profile.reviewCount !== 1 ? 's' : ''}
                </span>
                {stats?.averageRating != null && (
                  <>
                    <span aria-hidden className="text-white/15">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-amber-400" />
                      {stats.averageRating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>

              {profile.bio && (
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground/80">
                  {profile.bio}
                </p>
              )}

              {/* Friend actions */}
              {currentUser && currentUser.username !== username && profile.friendshipStatus && (
                <div className="mt-3">
                  {profile.friendshipStatus.status === 'none' && (
                    <DkButton
                      variant="glass"
                      size="xs"
                      onClick={async () => {
                        await apiClient.post(`/friends/requests/${profile.id}`)
                        queryClient.invalidateQueries({ queryKey: ['user', username] })
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Add Friend
                    </DkButton>
                  )}
                  {profile.friendshipStatus.status === 'pending_sent' && (
                    <DkButton variant="secondary" size="xs" disabled>
                      <Clock className="h-3.5 w-3.5" />
                      Request Sent
                    </DkButton>
                  )}
                  {profile.friendshipStatus.status === 'pending_received' && (
                    <div className="flex gap-2">
                      <DkButton
                        variant="glass"
                        size="xs"
                        onClick={async () => {
                          const requestId = profile.friendshipStatus?.requestId
                          if (requestId) {
                            await apiClient.post(`/friends/requests/${requestId}/accept`)
                            queryClient.invalidateQueries({ queryKey: ['user', username] })
                          }
                        }}
                      >
                        Accept
                      </DkButton>
                      <DkButton
                        variant="secondary"
                        size="xs"
                        onClick={async () => {
                          const requestId = profile.friendshipStatus?.requestId
                          if (requestId) {
                            await apiClient.post(`/friends/requests/${requestId}/reject`)
                            queryClient.invalidateQueries({ queryKey: ['user', username] })
                          }
                        }}
                      >
                        Decline
                      </DkButton>
                    </div>
                  )}
                  {profile.friendshipStatus.status === 'friends' && (
                    <DkButton variant="secondary" size="xs" disabled>
                      <UserCheck className="h-3.5 w-3.5" />
                      Friends
                    </DkButton>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* XP Bar */}
          <div className="mt-6 relative h-10 rounded-lg bg-white/[0.04] overflow-hidden ring-1 ring-white/[0.06]">
            {/* Fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-primary/40 via-primary/30 to-accent/25 transition-all duration-700 ease-out"
              style={{ width: `${gamification.xpProgress * 100}%` }}
            />
            {/* Subtle top highlight across the whole bar */}
            <div className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-b from-white/[0.04] to-transparent w-full pointer-events-none" />

            {/* Content overlay */}
            <div className="relative h-full flex items-center justify-between px-5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                  Level
                </span>
                <span className="text-sm font-extrabold text-primary tabular-nums leading-none">
                  {gamification.level}
                </span>
              </div>

              <div className="flex items-center gap-1 tabular-nums">
                <span className="text-xs font-semibold text-foreground/90">
                  {gamification.xp.toLocaleString()}
                </span>
                <span className="text-muted-foreground/30">/</span>
                <span className="text-xs text-muted-foreground/40">
                  {(gamification.xpToNextLevel + (gamification.level - 1) * 300).toLocaleString()}
                </span>
                <span className="ml-1.5 text-[10px] font-medium text-muted-foreground/35 uppercase tracking-wider">
                  XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform links — floating below hero */}
      {(profile.steam || profile.plex || profile.tmdbUsername) && (
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 -mt-3">
          <div className="flex flex-wrap gap-1.5">
            {profile.steam && (
              <a
                href={profile.steam.profileurl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-[var(--dk-shadow-sm)] hover:bg-[var(--dk-surface-elevated)] hover:text-foreground transition-all"
              >
                <SteamIcon className="h-3.5 w-3.5" />
                Steam
              </a>
            )}
            {profile.plex && (
              <a
                href={profile.plex.username ? `https://app.plex.tv/desktop/#!/u/${profile.plex.username}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-[var(--dk-shadow-sm)] hover:bg-[#e5a00d]/15 hover:text-[#e5a00d] transition-all"
              >
                <PlexIcon className="h-3.5 w-3.5 text-[#e5a00d]" />
                Plex
              </a>
            )}
            {profile.tmdbUsername && (
              <a
                href={`https://www.themoviedb.org/u/${profile.tmdbUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-[var(--dk-shadow-sm)] hover:bg-[#01b4e4]/15 hover:text-[#01b4e4] transition-all"
              >
                <TmdbIcon className="h-3.5 w-3.5 text-[#01b4e4]" />
                TMDb
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="pb-16">
      <div className="min-h-[60vh] sm:min-h-[50vh] rounded-3xl overflow-hidden">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    </div>
  )
}
