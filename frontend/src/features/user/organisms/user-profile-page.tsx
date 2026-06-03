import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CalendarDays, Star, UserPlus, UserCheck, Clock, Shield, Plus, Crown, Activity, BarChart3, Sparkles, Trophy } from 'lucide-react'

import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { TmdbIcon } from '@/features/dk-ui/atoms/tmdb-icon'

import { Skeleton } from '@ui/atoms/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { userQueries, computeReviewStats } from '../user-queries'
import { ProfileSectionRenderer } from './profile-section-renderer'
import { UserRatingSection } from '../molecules/user-rating-section'
import { FollowButton } from '../molecules/follow-button'
import { StreakDisplay } from '../molecules/streak-display'

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

function formatMemberSince(dateStr: string): { label: string; tooltip: string } {
 const joined = new Date(dateStr)
 const now = new Date()
 const diffMs = now.getTime() - joined.getTime()
 const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
 const years = Math.floor(days / 365)
 const months = Math.floor((days % 365) / 30)

 const exact = joined.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

 if (years < 1) {
 if (months < 1) return { label: 'this month', tooltip: exact }
 return { label: `${months}mo ago`, tooltip: exact }
 }
 if (years === 1 && months === 0) return { label: '1yr ago', tooltip: exact }
 if (years === 1) return { label: `1yr ${months}mo ago`, tooltip: exact }
 return { label: `${years}yr ago`, tooltip: exact }
}

// ── Level tier colors ──

interface LevelTier {
 color: string
 barColor: string
 glow: string
 hasShimmer: boolean
 hasGlow: boolean
}

const LEVEL_TIERS: { min: number; tier: LevelTier }[] = [
 { min: 50, tier: { color: '#a78bfa', barColor: '#a78bfa33', glow: '#8b5cf633', hasShimmer: true, hasGlow: true } },
 { min: 35, tier: { color: '#22d3ee', barColor: '#22d3ee33', glow: '#06b6d433', hasShimmer: true, hasGlow: true } },
 { min: 20, tier: { color: '#34d399', barColor: '#34d39933', glow: '#10b98133', hasShimmer: false, hasGlow: true } },
 { min: 10, tier: { color: '#fbbf24', barColor: '#fbbf2433', glow: '#eab30833', hasShimmer: false, hasGlow: false } },
 { min: 5, tier: { color: '#94a3b8', barColor: '#94a3b833', glow: '#64748b33', hasShimmer: false, hasGlow: false } },
 { min: 1, tier: { color: '#d97706', barColor: '#d9770633', glow: '#b4530933', hasShimmer: false, hasGlow: false } },
]

function getLevelTier(level: number): LevelTier {
 for (const entry of LEVEL_TIERS) {
 if (level >= entry.min) return entry.tier
 }
 return LEVEL_TIERS[LEVEL_TIERS.length - 1].tier
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
 strokeColor = 'var(--primary)',
 children,
}: {
 progress: number
 size: number
 strokeWidth?: number
 strokeColor?: string
 children: React.ReactNode
}) {
 const [animProgress, setAnimProgress] = useState(0)

 useEffect(() => {
 const id = requestAnimationFrame(() => setAnimProgress(progress))
 return () => cancelAnimationFrame(id)
 }, [progress])

 const radius = size / 2 - strokeWidth
 const circumference = 2 * Math.PI * radius
 const offset = circumference * (1 - animProgress)

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
 stroke={strokeColor}
 strokeWidth={strokeWidth}
 strokeLinecap="round"
 strokeDasharray={circumference}
 strokeDashoffset={offset}
 className="transition-[stroke-dashoffset] duration-700 ease-out"
 />
 </svg>
 <div className="absolute inset-0 flex items-center justify-center">
 {children}
 </div>
 </div>
 )
}

// ── Page ──

const ALL_SECTIONS = [
 { id: 'hof_movie', label: 'Hall of Fame · Movies', icon: Crown },
 { id: 'hof_show', label: 'Hall of Fame · Shows', icon: Crown },
 { id: 'hof_game', label: 'Hall of Fame · Games', icon: Crown },
 { id: 'hof_music', label: 'Hall of Fame · Music', icon: Crown },
 { id: 'library_breakdown', label: 'Library Breakdown', icon: BarChart3 },
 { id: 'rating_distribution', label: 'Rating Distribution', icon: Star },
 { id: 'mood_timeline', label: 'Mood Timeline', icon: Activity },
 { id: 'achievements', label: 'Achievements', icon: Trophy },
] as const

const DEFAULT_SECTIONS = ['hof_movie', 'hof_show', 'hof_game', 'hof_music', 'library_breakdown', 'rating_distribution', 'mood_timeline', 'achievements']

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

 const xpProgress = profileQuery.data ? computeGamification(profileQuery.data.totalXp).xpProgress : 0

 const [barProgress, setBarProgress] = useState(0)
 useEffect(() => {
 const timeout = setTimeout(() => {
 requestAnimationFrame(() => setBarProgress(xpProgress))
 }, 500)
 return () => clearTimeout(timeout)
 }, [xpProgress])

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
 const tier = getLevelTier(gamification.level)

 return (
 <div className="pb-16">
 <Helmet>
 <title>{`${profile.username} - Otix`}</title>
 <meta name="description" content={`${profile.username}'s profile on Otix — check out their library, lists, and activity.`} />
 <meta property="og:title" content={`${profile.username} - Otix`} />
 <meta property="og:description" content={`${profile.username}'s profile on Otix.`} />
 <meta property="og:type" content="profile" />
 <meta name="twitter:card" content="summary" />
 </Helmet>

 {/* Hero */}
 <div className="relative flex min-h-[75vh] sm:min-h-[50vh] items-end overflow-hidden rounded-3xl shadow-[var(--dk-shadow-glass)] animate-hero-fade-in">
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
 <div className="relative z-10 mx-auto w-full lg:max-w-7xl px-4 pb-8 pt-20 sm:px-6 sm:pb-10 lg:px-8">
 <div className="flex flex-row items-end gap-5 sm:gap-8">
 {/* Avatar with XP ring */}
 <div className="shrink-0 animate-hero-scale-in" style={{ animationDelay: '50ms' }}>
 <XPProgressRing progress={gamification.xpProgress} size={120} strokeWidth={4} strokeColor={tier.color}>
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
 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl animate-hero-slide-up"
 style={{ textShadow: '0 2px 20px rgba(0,0,0,0.4)', animationDelay: '100ms' }}
 >
 {profile.username}
 {profile.isAdmin && (
 <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80 align-middle" />
 )}
 <span className="inline-flex items-center ml-2.5 align-middle [&>div>span:last-child]:hidden scale-[0.8]">
 <UserRatingSection username={username} />
 </span>
 </h1>

 {/* Meta */}
 <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-white/55 font-medium animate-hero-slide-up" style={{ animationDelay: '150ms' }}>
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
 <p className="max-w-xl text-sm leading-relaxed text-muted-foreground/80 animate-hero-slide-up" style={{ animationDelay: '200ms' }}>
 {profile.bio}
 </p>
 )}

 {/* Follow + Friend actions */}
 {currentUser && currentUser.username !== username && (
 <div className="mt-3 flex items-center gap-2 animate-hero-slide-up" style={{ animationDelay: '250ms' }}>
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
 <div className="mt-3 animate-hero-slide-up text-xs text-white/30" style={{ animationDelay: '250ms' }}>
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
 className="mt-6 relative h-10 rounded-lg bg-white/[0.04] overflow-hidden ring-1 ring-white/[0.06] animate-hero-reveal-bar"
 style={{
 animationDelay: '300ms',
 boxShadow: tier.hasGlow ? `0 0 20px ${tier.glow}, inset 0 0 12px ${tier.glow}` : undefined,
 }}
 >
 {/* Fill */}
 <div
 className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out"
 style={{
 width: `${barProgress * 100}%`,
 background: tier.barColor,
 }}
 />
 {/* Shimmer effect (level 35+) */}
 {tier.hasShimmer && (
 <div
 className="absolute inset-y-0 left-0 rounded-lg overflow-hidden pointer-events-none"
 style={{ width: `${barProgress * 100}%` }}
 >
 <div
 className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
 style={{ animation: 'xpShimmer 2s ease-in-out infinite' }}
 />
 </div>
 )}
 {/* Subtle top highlight across the whole bar */}
 <div className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-b from-white/[0.04] to-transparent w-full pointer-events-none" />

 {/* Content overlay */}
 <div className="relative h-full flex items-center justify-between px-5">
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
 · {profile.levelTitle ?? gamification.level}
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
 {/* XP Rank position */}
 {profile.xpRank != null && (
 <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/30 animate-hero-reveal-bar" style={{ animationDelay: '350ms' }}>
 <span>#{profile.xpRank.toLocaleString()}</span>
 {profile.xpPercentile != null && (
 <span>· Top {profile.xpPercentile}%</span>
 )}
 </div>
 )}
 {/* Streaks */}
 <div className="mt-2 animate-hero-reveal-bar" style={{ animationDelay: '380ms' }}>
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
 <div className="relative z-10 mx-auto w-full lg:max-w-7xl px-4 sm:px-6 lg:px-8 -mt-3 animate-hero-slide-up" style={{ animationDelay: '350ms' }}>
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

 {/* Profile content */}
 <div className="mx-auto w-full lg:max-w-7xl px-4 sm:px-6 lg:px-8 mt-8 space-y-10">
 {(() => {
 const currentSections = profile.profileSections ?? DEFAULT_SECTIONS
 const availableSections = ALL_SECTIONS.filter((s) => !currentSections.includes(s.id))
 const isOwner = currentUser?.username === username

 return (
 <>
 <ProfileSectionRenderer
 username={username}
 sections={currentSections}
 isOwner={isOwner}
 onRemoveSection={isOwner ? async (sectionId) => {
 const updated = currentSections.filter((s) => s !== sectionId)
 try {
 await apiClient.patch('/auth/me', { profile_sections: updated })
 queryClient.setQueryData(['user', username], (prev: typeof profile) => {
 if (!prev) return prev
 return { ...prev, profileSections: updated }
 })
 } catch { /* silently fail */ }
 } : undefined}
 loginStreak={profile.currentLoginStreak ?? 0}
 longestLoginStreak={profile.longestLoginStreak ?? 0}
 reviewStreak={profile.currentReviewStreak ?? 0}
 longestReviewStreak={profile.longestReviewStreak ?? 0}
 />

 {isOwner && availableSections.length > 0 && (
 <AddSectionButton
 availableSections={availableSections}
 currentSections={currentSections}
 onSectionsUpdated={(updated) => {
 queryClient.setQueryData(['user', username], (prev: typeof profile) => {
 if (!prev) return prev
 return { ...prev, profileSections: updated }
 })
 }}
 />
 )}
 </>
 )
 })()}
 </div>
 </div>
 )
}

function AddSectionButton({
 availableSections,
 currentSections,
 onSectionsUpdated,
}: {
 availableSections: readonly { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
 currentSections: string[]
 onSectionsUpdated: (sections: string[]) => void
}) {
 const [open, setOpen] = useState(false)

 const handleAdd = async (sectionId: string) => {
 const updated = [...currentSections, sectionId]
 try {
 await apiClient.patch('/auth/me', { profile_sections: updated })
 onSectionsUpdated(updated)
 } catch {
 // silently fail
 }
 setOpen(false)
 }

 return (
 <div className="relative">
 <button
 onClick={() => setOpen(!open)}
 className="w-full rounded-2xl border-2 border-dashed border-white/[0.08] bg-[var(--dk-surface-glass)] p-6 text-center hover:border-white/[0.15] transition-colors"
 >
 <Plus className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1" />
 <p className="text-xs text-muted-foreground/40">Add section</p>
 </button>

 {open && (
 <>
 <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
 <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] overflow-hidden">
 <div className="p-2">
 <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Available Sections</p>
 {availableSections.map((section) => {
 const Icon = section.icon
 return (
 <button
 key={section.id}
 onClick={() => handleAdd(section.id)}
 className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[var(--dk-surface-glass)] transition-colors"
 >
 <Icon className="h-4 w-4 text-muted-foreground" />
 <span className="text-sm">{section.label}</span>
 <Plus className="h-4 w-4 ml-auto text-muted-foreground/30" />
 </button>
 )
 })}
 </div>
 </div>
 </>
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
