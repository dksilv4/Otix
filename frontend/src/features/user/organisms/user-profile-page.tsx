import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CalendarDays, MessageSquareText } from 'lucide-react'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { ReviewCard } from '@/features/review/molecules/review-card'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'

function formatJoinDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

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

export function UserProfilePage() {
  const params = useParams({ strict: false }) as { username?: string }
  const username = params.username || ''

  const profileQuery = useQuery(userQueries.profile(username))
  const reviewsQuery = useQuery(userQueries.reviews(username))

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
  const reviews = reviewsQuery.data ?? []

  const backgroundStyle = profile.backgroundUrl
    ? { background: `url(${profile.backgroundUrl}) center/cover no-repeat` }
    : { background: pickGradient(profile.username) }

  return (
    <div className="pb-16">
      <Helmet>
        <title>{`${profile.username} - Otix`}</title>
      </Helmet>

      {/* ── Hero ── */}
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="relative h-56 sm:h-64 lg:h-72" style={backgroundStyle}>
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          {/* Subtle dot pattern on gradients */}
          {!profile.backgroundUrl && (
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
          )}
        </div>

        {/* Avatar + identity */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-16 sm:-mt-20">
            <div className="mx-auto sm:mx-0 shrink-0 ring-[3px] ring-background rounded-full">
              <DkAvatar
                src={profile.avatarUrl}
                name={profile.username}
                size="xl"
                className="!h-24 !w-24 sm:!h-28 sm:!w-28"
              />
            </div>

            <div className="text-center sm:text-left sm:pb-3 min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em]">
                {profile.username}
              </h1>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>Joined {formatJoinDate(profile.createdAt)}</span>
              </div>
            </div>
          </div>

          {profile.bio && (
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-prose text-center sm:text-left">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <MessageSquareText className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Reviews</span>
            </div>
            <span className="text-3xl font-bold tabular-nums">{profile.reviewCount}</span>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Joined</span>
            </div>
            <span className="text-xl font-bold tabular-nums">
              {new Date(profile.createdAt).getFullYear()}
            </span>
          </div>
        </div>

        {/* Reviews */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Reviews
          </h2>

          {reviewsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-10 text-center">
              <MessageSquareText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <ReviewCard key={`${review.userId}-${review.mediaItemId}`} review={review} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="pb-16">
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <Skeleton className="h-56 sm:h-64 lg:h-72 w-full rounded-none" />
      </div>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-16 sm:-mt-20">
          <div className="mx-auto sm:mx-0 ring-[3px] ring-background rounded-full">
            <Skeleton className="h-24 w-24 sm:h-28 sm:w-28 rounded-full" />
          </div>
          <div className="text-center sm:text-left sm:pb-3">
            <Skeleton className="h-8 w-40 mx-auto sm:mx-0" />
            <Skeleton className="mt-1 h-4 w-28 mx-auto sm:mx-0" />
          </div>
        </div>
        <Skeleton className="mt-4 h-5 w-64 mx-auto sm:mx-0" />
        <div className="mt-10 grid grid-cols-2 gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <div className="mt-8 space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
