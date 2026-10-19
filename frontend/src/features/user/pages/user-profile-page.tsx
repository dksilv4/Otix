import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import {
  CalendarDays,
  Star,
  UserPlus,
  UserCheck,
  Clock,
  Shield,
  Sparkles,
} from 'lucide-react'

import { DkAvatar } from '@ui/atoms/avatar'
import { DkButton } from '@ui/atoms/button'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'

import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { userQueries, computeReviewStats } from '../user-queries'
import { UserRatingSection } from '../components/molecules/user-rating-section'
import { FollowButton } from '../components/molecules/follow-button'
import { StreakDisplay } from '../components/molecules/streak-display'
import { UserSocialCounts } from '../components/molecules/user-social-counts'
import { UserProfileGameSessions } from '../components/organisms/user-profile-game-sessions'

import { computeGamification, getLevelTier, pickGradient, formatMemberSince } from '@user/utils'
import { XPProgressRing } from '@user/components/atoms/user-xp-progress-ring'
import { UserProfileSkeleton } from '@user/components/organisms/user-profile-skeleton'

// ── Page ──

export const UserProfilePage = () => {
  const { username } = useParams({ from: '/u/$username' })
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const profileQuery = useQuery(userQueries.profile(username))
  const reviewsQuery = useQuery(userQueries.reviews(username))

  // Animate XP bar
  const [barProgress, setBarProgress] = useState(0)
  const profile = profileQuery.data
  const gamification = useMemo(
    () => computeGamification(profile?.totalXp ?? 0),
    [profile?.totalXp],
  )
  const tier = useMemo(() => getLevelTier(gamification.level), [gamification.level])
  const stats = useMemo(
    () => (reviewsQuery.data ? computeReviewStats(reviewsQuery.data) : null),
    [reviewsQuery.data],
  )

  useEffect(() => {
    if (profile) {
      const id = setTimeout(() => setBarProgress(gamification.xpProgress), 500)
      return () => clearTimeout(id)
    }
  }, [profile, gamification.xpProgress])

  // Loading state
  if (profileQuery.isLoading) {
    return (
      <div className="w-full flex flex-col">
        <div className="mx-4">
          <UserProfileSkeleton />
        </div>
      </div>
    )
  }

  // Error / missing
  if (profileQuery.isError || !profile) {
    return (
      <div className="w-full flex flex-col">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold mb-2">User not found</h1>
            <p className="text-muted-foreground mb-4">
              This profile doesn&apos;t exist or has been removed.
            </p>
            <a href="/" className="text-sm font-medium text-primary hover:underline">
              Go home
            </a>
          </div>
        </div>
      </div>
    )
  }

  const gradient = pickGradient(profile.username)

  return (
    <div id="user-profile-page" className="w-full flex flex-col pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 w-full flex flex-col">
      <Helmet>
        <title>{`${profile.username} - Otix`}</title>
        <meta
          name="description"
          content={`${profile.username}'s profile on Otix — check out their library, lists, and activity.`}
        />
        <meta property="og:title" content={`${profile.username} - Otix`} />
        <meta property="og:description" content={`${profile.username}'s profile on Otix.`} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
      </Helmet>

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden rounded-2xl flex flex-col justify-end mx-0 min-h-[380px] bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] transition-shadow duration-300 shadow-md hover:shadow-lg"
      >
        <div className="absolute inset-0">
          {profile.backgroundUrl ? (
            <img
              src={profile.backgroundUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: gradient }}
            />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-t from-[var(--dk-surface-base)] via-[var(--dk-surface-base)]/75 to-transparent"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-[var(--dk-surface-base)]/80 via-[var(--dk-surface-base)]/40 to-transparent"
          />
        </div>

        {/* Content */}
        <div className="relative z-10 px-6 pt-6 pb-6">
          <div className="flex items-end gap-6 mb-4">
            {/* Avatar + XP ring */}
            <div
              className="shrink-0"
              style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '100ms' }}
            >
              <XPProgressRing
                progress={gamification.xpProgress}
                size={120}
                strokeWidth={4}
                strokeColor={tier.color}
              >
                <DkAvatar
                  src={profile.avatarUrl}
                  name={profile.username}
                  size="xl"
                  className="!h-20 !w-20 rounded-full ring-2 ring-background"
                />
              </XPProgressRing>
            </div>

            {/* Name, meta, bio */}
            <div className="min-w-0 flex-1">
              <h1
                className="text-2xl font-bold text-foreground mb-1"
                style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '100ms' }}
              >
                {profile.username}
                {profile.isAdmin && (
                  <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-500/80 align-middle" />
                )}
                <span className="inline-flex items-center ml-2.5 align-middle [&>div>span:last-child]:hidden scale-[0.8]">
                  <UserRatingSection username={username} />
                </span>
              </h1>

              <div
                className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground"
                style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '150ms' }}
              >
                {(() => {
                  const m = formatMemberSince(profile.createdAt)
                  return (
                    <span className="inline-flex items-center gap-1.5" title={m.tooltip}>
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                      Joined {m.label}
                    </span>
                  )
                })()}
                <span aria-hidden className="text-muted-foreground/30">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500/80" />
                  {profile.compositeScore ?? 0} aura
                </span>
                {stats?.averageRating != null && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-amber-500" />
                      {stats.averageRating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>

              {profile.bio && (
                <p
                  className="mt-3 text-sm max-w-xl text-muted-foreground"
                  style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '200ms' }}
                >
                  {profile.bio}
                </p>
              )}

              {/* Follow + Friend actions */}
              {currentUser && currentUser.username !== username && (
                <div
                  className="flex flex-wrap items-center gap-2 mt-4"
                  style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '250ms' }}
                >
                  <FollowButton
                    username={username}
                    isFollowing={profile.isFollowing ?? false}
                  />
                  {profile.friendshipStatus && (
                    <>
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
                    </>
                  )}
                  {/* Social counts */}
                  <UserSocialCounts
                    username={username}
                    friendCount={profile.friendCount ?? 0}
                    followerCount={profile.followerCount ?? 0}
                    followingCount={profile.followingCount ?? 0}
                    className="ml-1"
                  />
                  {/* Proposal stats */}
                  {(profile.proposalCount ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground/60 ml-1">
                      · {profile.proposalCount} proposal{profile.proposalCount !== 1 ? 's' : ''}
                      {profile.proposalApprovalRate != null
                        ? ` · ${Math.round(profile.proposalApprovalRate)}% approved`
                        : ''}
                    </span>
                  )}
                </div>
              )}
              {currentUser && currentUser.username === username && (
                <div
                  className="mt-4"
                  style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '250ms' }}
                >
                  <UserSocialCounts
                    username={username}
                    friendCount={profile.friendCount ?? 0}
                    followerCount={profile.followerCount ?? 0}
                    followingCount={profile.followingCount ?? 0}
                  />
                  {(profile.proposalCount ?? 0) > 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground/60">
                      {profile.proposalCount} proposal{profile.proposalCount !== 1 ? 's' : ''}
                      {profile.proposalApprovalRate != null
                        ? ` · ${Math.round(profile.proposalApprovalRate)}% approved`
                        : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* XP Bar */}
          <div
            className="relative rounded-xl"
            style={{
              animation: 'profileFadeIn 0.4s ease-out both',
              animationDelay: '300ms',
              boxShadow: tier.hasGlow ? `0 0 20px ${tier.glow}, inset 0 0 12px ${tier.glow}` : undefined,
            }}
          >
            <div className="relative h-[52px] rounded-xl overflow-hidden bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
              {/* Fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-xl transition-all duration-1000 ease-out"
                style={{
                  width: `${barProgress * 100}%`,
                  background: tier.barColor,
                }}
              />
              {/* Shimmer effect (level 35+) */}
              {tier.hasShimmer && (
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${barProgress * 100}%` }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
                      animation: 'xpShimmer 2s ease-in-out infinite',
                    }}
                  />
                </div>
              )}
              {/* Subtle top highlight across the whole bar */}
              <div
                className="absolute top-0 inset-x-0 h-[1px]"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
              />

              {/* Content overlay */}
              <div className="absolute inset-0 flex items-center justify-between px-4">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: `${tier.color}b3` }}
                  >
                    Level
                  </span>
                  <span
                    className="text-sm font-extrabold tabular-nums leading-none"
                    style={{ color: tier.color }}
                  >
                    {gamification.level}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground/50 ml-0.5">
                    · {profile.levelTitle ?? gamification.levelTitle}
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

            {/* XP Rank position */}
            {profile.xpRank != null && (
              <div
                className="mt-1 text-right text-[10px] font-medium text-muted-foreground/60"
                style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '350ms' }}
              >
                <span>#{profile.xpRank.toLocaleString()}</span>
                {profile.xpPercentile != null && (
                  <span>· Top {profile.xpPercentile}%</span>
                )}
              </div>
            )}

            {/* Streaks */}
            <div
              className="mt-0.5 flex justify-end"
              style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '380ms' }}
            >
              <StreakDisplay
                loginStreak={profile.currentLoginStreak ?? 0}
                longestLoginStreak={profile.longestLoginStreak ?? 0}
                reviewStreak={profile.currentReviewStreak ?? 0}
                longestReviewStreak={profile.longestReviewStreak ?? 0}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Platform links — floating below hero */}
      {(profile.steam || profile.plex || profile.tmdbUsername) && (
        <div
          className="mx-4 px-6 -mt-3 relative z-10"
          style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '350ms' }}
        >
          <div className="flex items-center gap-2">
            {profile.steam && (
              <a
                href={profile.steam.profileurl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground border border-[var(--dk-separator)]"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground border border-[var(--dk-separator)]"
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground border border-[var(--dk-separator)]"
              >
                <TmdbIcon className="h-3.5 w-3.5 text-[#01b4e4]" />
                TMDb
              </a>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Private Gaming Performance & Sessions (Owner only) */}
      {currentUser?.username === profile.username && (
        <div className="w-full mt-10">
          <UserProfileGameSessions username={username} />
        </div>
      )}

    </div>
  )
};
