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

import { DkAvatar } from '@/old-features/dk-ui/atoms/avatar'
import { DkButton } from '@/old-features/dk-ui/atoms/button'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'

import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { userQueries, computeReviewStats } from '@/old-features/user/user-queries'
import { UserRatingSection } from '@/old-features/user/molecules/user-rating-section'
import { FollowButton } from '@/old-features/user/molecules/follow-button'
import { StreakDisplay } from '@/old-features/user/molecules/streak-display'

import { computeGamification, getLevelTier, pickGradient, formatMemberSince } from '@user/utils'
import { XPProgressRing } from '@user/components/atoms/xp-progress-ring'
import { UserProfileSkeleton } from '@user/components/organisms/user-profile-skeleton'
import './user-profile-page.scss'

// ── Page ──

export function UserProfilePage() {
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
  if (profileQuery.isLoading) return <UserProfileSkeleton />

  // Error / missing
  if (profileQuery.isError || !profile) {
    return (
      <div className="w-full">
        <div className="dk-user-profile-page__error">
          <div className="dk-user-profile-page__error-card">
            <h1 className="dk-user-profile-page__error-title">User not found</h1>
            <p className="dk-user-profile-page__error-text">
              This profile doesn&apos;t exist or has been removed.
            </p>
            <a href="/" className="dk-user-profile-page__error-link">
              Go home
            </a>
          </div>
        </div>
      </div>
    )
  }

  const gradient = pickGradient(profile.username)
  const textShadow = tier.hasGlow ? '0 0 12px rgba(255,255,255,0.15)' : undefined

  return (
    <div className="w-full">
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
      <div className="dk-user-profile-page__hero">
        <div className="dk-user-profile-page__hero-backdrop">
          {profile.backgroundUrl ? (
            <img
              src={profile.backgroundUrl}
              alt=""
              className="dk-user-profile-page__hero-backdrop-img"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: gradient }}
            />
          )}
          <div className="dk-user-profile-page__hero-backdrop-overlay" />
          <div className="dk-user-profile-page__hero-backdrop-radial-1" />
          <div className="dk-user-profile-page__hero-backdrop-radial-2" />
          {!profile.backgroundUrl && (
            <div className="dk-user-profile-page__hero-backdrop-dots" />
          )}
        </div>

        {/* Content */}
        <div className="dk-user-profile-page__hero-content">
          <div className="dk-user-profile-page__hero-row">
            {/* Avatar + XP ring */}
            <div className="dk-user-profile-page__hero-avatar" style={{ animationDelay: '100ms' }}>
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
            <div className="dk-user-profile-page__hero-info">
              <h1
                className="dk-user-profile-page__hero-name"
                style={{ animationDelay: '100ms', textShadow }}
              >
                {profile.username}
                {profile.isAdmin && (
                  <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80 align-middle" />
                )}
                <span className="scale-[0.8]">
                  <UserRatingSection username={username} />
                </span>
              </h1>

              <div className="dk-user-profile-page__hero-meta" style={{ animationDelay: '150ms' }}>
                {(() => {
                  const m = formatMemberSince(profile.createdAt)
                  return (
                    <span className="inline-flex items-center gap-1.5" title={m.tooltip}>
                      <CalendarDays className="h-3.5 w-3.5 text-white/40" />
                      Joined {m.label}
                    </span>
                  )
                })()}
                <span aria-hidden className="text-white/15">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400/80" />
                  {profile.compositeScore ?? 0} aura
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
                <p className="dk-user-profile-page__hero-bio" style={{ animationDelay: '200ms' }}>
                  {profile.bio}
                </p>
              )}

              {/* Follow + Friend actions */}
              {currentUser && currentUser.username !== username && (
                <div className="dk-user-profile-page__hero-actions" style={{ animationDelay: '250ms' }}>
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
                  {/* Follower counts */}
                  <span className="text-xs text-white/30 ml-1">
                    {profile.followerCount ?? 0} followers · {profile.followingCount ?? 0} following
                  </span>
                  {/* Proposal stats */}
                  {(profile.proposalCount ?? 0) > 0 && (
                    <span className="text-xs text-white/30 ml-1">
                      · {profile.proposalCount} proposal{profile.proposalCount !== 1 ? 's' : ''}
                      {profile.proposalApprovalRate != null
                        ? ` · ${Math.round(profile.proposalApprovalRate)}% approved`
                        : ''}
                    </span>
                  )}
                </div>
              )}
              {currentUser && currentUser.username === username && (
                <div className="dk-user-profile-page__hero-owner-info" style={{ animationDelay: '250ms' }}>
                  {profile.followerCount ?? 0} followers · {profile.followingCount ?? 0} following
                  {(profile.proposalCount ?? 0) > 0 && (
                    <span>
                      {' · '}{profile.proposalCount} proposal{profile.proposalCount !== 1 ? 's' : ''}
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
            className="dk-user-profile-page__xp-bar"
            style={{
              animationDelay: '300ms',
              boxShadow: tier.hasGlow ? `0 0 20px ${tier.glow}, inset 0 0 12px ${tier.glow}` : undefined,
            }}
          >
          <div className="dk-user-profile-page__xp-bar-track">
            {/* Fill */}
            <div
              className="dk-user-profile-page__xp-bar-fill"
              style={{
                width: `${barProgress * 100}%`,
                background: tier.barColor,
              }}
            />
            {/* Shimmer effect (level 35+) */}
            {tier.hasShimmer && (
              <div
                className="dk-user-profile-page__xp-bar-shimmer-wrap"
                style={{ width: `${barProgress * 100}%` }}
              >
                <div
                  className="dk-user-profile-page__xp-bar-shimmer"
                  style={{ animation: 'xpShimmer 2s ease-in-out infinite' }}
                />
              </div>
            )}
            {/* Subtle top highlight across the whole bar */}
            <div className="dk-user-profile-page__xp-bar-highlight" />

            {/* Content overlay */}
            <div className="dk-user-profile-page__xp-bar-content">
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
              <div className="dk-user-profile-page__xp-bar-rank" style={{ animationDelay: '350ms' }}>
                <span>#{profile.xpRank.toLocaleString()}</span>
                {profile.xpPercentile != null && (
                  <span>· Top {profile.xpPercentile}%</span>
                )}
              </div>
            )}

            {/* Streaks */}
            <div className="dk-user-profile-page__xp-bar-streaks" style={{ animationDelay: '380ms' }}>
              <StreakDisplay
                loginStreak={profile.currentLoginStreak ?? 0}
                longestLoginStreak={profile.longestLoginStreak ?? 0}
                reviewStreak={profile.currentReviewStreak ?? 0}
                longestReviewStreak={profile.longestReviewStreak ?? 0}
              />
            </div>
          </div>
        </div>

        {/* Platform links — floating below hero */}
        {(profile.steam || profile.plex || profile.tmdbUsername) && (
          <div className="dk-user-profile-page__platforms" style={{ animationDelay: '350ms' }}>
            <div className="dk-user-profile-page__platforms-inner">
              {profile.steam && (
                <a
                  href={profile.steam.profileurl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dk-user-profile-page__platform-link"
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
                  className="dk-user-profile-page__platform-link dk-user-profile-page__platform-link--plex"
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
                  className="dk-user-profile-page__platform-link dk-user-profile-page__platform-link--tmdb"
                >
                  <TmdbIcon className="h-3.5 w-3.5 text-[#01b4e4]" />
                  TMDb
                </a>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
