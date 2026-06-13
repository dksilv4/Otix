import { useState, useMemo, useEffect, Suspense, lazy, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { format, subDays, addDays, isToday, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth'
import { userQueries, type DailyActivityResponse } from '@/old-features/user/user-queries'
import { Carousel } from '@ui/molecules/carousel'
import { DiscoverMediaCard } from '@discover/molecules/discover-media-card'
import {
  Play, Star, Eye, Tv, Flame,
  Bookmark, Smile, ChevronLeft, ChevronRight,
  Trophy, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))

function getGreeting(username?: string): string {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return username ? `${greeting}, ${username}` : greeting
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const INTERACTION_LABELS: Record<string, string> = {
  watched: 'Watched',
  like: 'Liked',
  played: 'Played',
  watchlist: 'Added to watchlist',
  started: 'Started',
  completed: 'Completed',
  dropped: 'Dropped',
}

export function DashboardPage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: '/discover', replace: true })
    }
  }, [isAuthenticated, navigate])

  if (!isAuthenticated || !user) return null

  return <HomeDashboard username={user.username} />
}

function HomeDashboard({ username }: { username: string }) {
  const [greeting] = useState(() => getGreeting(username))
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const [selectedDay, setSelectedDay] = useState(todayStr)

  const profileQuery = useQuery(userQueries.profile(username))
  const dailyQuery = useQuery(userQueries.dailyActivity(selectedDay))
  const continueQuery = useQuery(userQueries.continueWatching())

  const goToPrevDay = useCallback(() => {
    setSelectedDay((d) => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'))
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDay((d) => format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))
  }, [])

  const goToToday = useCallback(() => {
    setSelectedDay(todayStr)
  }, [todayStr])

  const selectedDate = parseISO(selectedDay)
  const isSelectedToday = isToday(selectedDate)
  const formattedDate = format(selectedDate, 'EEEE, MMMM d, yyyy')
  const canGoForward = !isSelectedToday

  const profile = profileQuery.data
  const daily = dailyQuery.data

  return (
    <div className="relative min-h-screen w-full">
      <Helmet>
        <title>Otix — Home</title>
      </Helmet>

      <Suspense fallback={null}>
        <AnimatedShaderBackground mode="idle" />
      </Suspense>
      <div className="relative z-10">
        {/* ─── Hero ─── */}
        <div className="relative w-full h-[55vh] min-h-[400px] overflow-hidden">
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-[#0a0a0f] to-[#0a0a0f]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/40 to-transparent" />

          {/* Content on hero */}
          <div className="relative z-10 h-full flex flex-col justify-end pb-10">
            <div className="max-w-5xl mx-auto w-full px-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
                    {formattedDate}
                  </span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                  {greeting}
                </h1>
              </motion.div>

              {/* Level & XP — single compact bar */}
              {profile && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="mt-4 relative overflow-hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] ring-1 ring-white/[0.06]"
                >
                  {/* Fill bar */}
                  <div
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/25 to-primary/15"
                    style={{ width: `${((profile.totalXp % 300) / 300) * 100}%` }}
                  />
                  {/* Content */}
                  <div className="relative z-10 flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-sm font-semibold text-white/90">{profile.level}</span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="max-w-5xl mx-auto w-full px-4 pb-24 -mt-6 relative z-20">
          {/* Day Navigator */}
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex items-center justify-between mb-6 bg-white/[0.04] backdrop-blur-xl rounded-2xl px-4 py-3 ring-1 ring-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevDay}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground/50 hover:text-foreground/80"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground/70 px-2 min-w-[200px] text-center select-none">
                {formattedDate}
              </span>
              <button
                onClick={goToNextDay}
                disabled={!canGoForward}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  canGoForward
                    ? 'hover:bg-white/[0.06] text-muted-foreground/50 hover:text-foreground/80'
                    : 'text-white/[0.04] cursor-not-allowed',
                )}
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isSelectedToday && (
              <button
                onClick={goToToday}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                Today
              </button>
            )}
          </motion.div>

          {/* Day content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedDay}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {dailyQuery.isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
              ) : daily ? (
                <DailyTimeline daily={daily} username={username} />
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* ─── Continue Section ─── */}
          {continueQuery.data && continueQuery.data.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="w-full mt-10"
            >
              <div className="flex items-center gap-2 mb-4">
                <Play className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground/80">Continue</h2>
              </div>
              <Carousel isLoading={continueQuery.isLoading}>
                {continueQuery.data?.map((item) => (
                  <DiscoverMediaCard
                    key={item.id}
                    item={item}
                    subtitle={'episodeContext' in item ? (item as { episodeContext: string | null }).episodeContext : null}
                  />
                ))}
              </Carousel>
            </motion.section>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Daily Activity Timeline ─── */

interface TimelineGroup {
  key: string
  label: string
  icon: React.ReactNode
  items: React.ReactNode[]
}

function DailyTimeline({ daily, username }: { daily: DailyActivityResponse; username: string }) {
  const groups: TimelineGroup[] = []

  // Mood check-in
  if (daily.mood) {
    groups.push({
      key: 'mood',
      label: 'Mood',
      icon: <Smile className="h-3.5 w-3.5 text-teal-400" />,
      items: [
        <div key="mood" className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm capitalize text-teal-300/90 font-medium">{daily.mood.mood}</span>
            {daily.mood.feeling && (
              <span className="text-xs text-muted-foreground/50 capitalize">{daily.mood.feeling}</span>
            )}
          </div>
          {daily.mood.note && (
            <span className="text-xs text-muted-foreground/40 italic truncate">— {daily.mood.note}</span>
          )}
        </div>,
      ],
    })
  }

  // Reviews
  if (daily.reviews.length > 0) {
    groups.push({
      key: 'reviews',
      label: 'Reviews',
      icon: <Star className="h-3.5 w-3.5 text-amber-400" />,
      items: daily.reviews.map((r) => (
        <Link
          key={r.id}
          to="/media/$mediaType/$mediaId"
          params={{ mediaType: r.media_type, mediaId: r.media_item_id }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
        >
          {r.poster_url && (
            <img src={r.poster_url} alt="" className="h-10 w-7 rounded object-cover ring-1 ring-white/[0.06] shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/80 truncate group-hover:text-foreground/90 transition-colors">
              Reviewed <span className="font-medium">{r.media_title}</span>
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {r.score && (
                <span className="inline-flex items-center gap-0.5 text-xs text-amber-400/70">
                  <Star className="h-3 w-3" />{r.score}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground/40">{timeAgo(r.created_at)}</span>
            </div>
          </div>
        </Link>
      )),
    })
  }

  // Episode interactions
  if (daily.episodes.length > 0) {
    groups.push({
      key: 'episodes',
      label: 'Episodes',
      icon: <Tv className="h-3.5 w-3.5 text-violet-400" />,
      items: daily.episodes.map((ep) => (
        <Link
          key={ep.id}
          to="/media/$mediaType/$mediaId"
          params={{ mediaType: 'show', mediaId: ep.show_id }}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
        >
          {ep.poster_url && (
            <img src={ep.poster_url} alt="" className="h-10 w-7 rounded object-cover ring-1 ring-white/[0.06] shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/80 truncate group-hover:text-foreground/90 transition-colors">
              Watched <span className="font-medium">S{ep.season_number}E{ep.episode_number}</span> of{' '}
              <span className="font-medium">{ep.show_title}</span>
            </p>
            <span className="text-[11px] text-muted-foreground/40">{timeAgo(ep.created_at)}</span>
          </div>
        </Link>
      )),
    })
  }

  // Media interactions
  if (daily.interactions.length > 0) {
    groups.push({
      key: 'interactions',
      label: 'Activity',
      icon: <Eye className="h-3.5 w-3.5 text-sky-400" />,
      items: daily.interactions.map((inter) => {
        const label = INTERACTION_LABELS[inter.interaction_type] ?? inter.interaction_type
        return (
          <Link
            key={inter.id}
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: inter.media_type, mediaId: inter.media_item_id }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
          >
            {inter.poster_url && (
              <img src={inter.poster_url} alt="" className="h-10 w-7 rounded object-cover ring-1 ring-white/[0.06] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground/80 truncate group-hover:text-foreground/90 transition-colors">
                {label} <span className="font-medium">{inter.media_title}</span>
              </p>
              <span className="text-[11px] text-muted-foreground/40">{timeAgo(inter.created_at)}</span>
            </div>
          </Link>
        )
      }),
    })
  }

  // Workouts
  if (daily.workouts.length > 0) {
    groups.push({
      key: 'workouts',
      label: 'Workouts',
      icon: <Flame className="h-3.5 w-3.5 text-orange-400" />,
      items: daily.workouts.map((w) => (
        <Link
          key={w.id}
          to="/workout"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
        >
          <div className="h-10 w-7 rounded bg-gradient-to-br from-orange-500/20 to-orange-500/5 ring-1 ring-orange-500/20 flex items-center justify-center shrink-0">
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/80 truncate group-hover:text-foreground/90 transition-colors">
              Workout{w.completed_at ? '' : ' (in progress)'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground/50">{w.exercise_count} exercises</span>
              <span className="text-[11px] text-muted-foreground/40">{timeAgo(w.started_at)}</span>
            </div>
          </div>
        </Link>
      )),
    })
  }

  // Empty state — no activity at all
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center mb-3">
          <Bookmark className="h-5 w-5 text-muted-foreground/20" />
        </div>
        <p className="text-sm text-muted-foreground/50 max-w-xs">
          {isToday(parseISO(daily.date))
            ? 'Nothing logged yet today'
            : 'Nothing was logged on this day'}
        </p>
        {isToday(parseISO(daily.date)) && (
          <div className="flex items-center gap-2 mt-4">
            <Link
              to="/search"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.06] transition-colors"
            >
              <Bookmark className="h-3 w-3" />
              Log something
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-2 px-1 mb-2">
            {group.icon}
            <span className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider">
              {group.label}
            </span>
            <span className="text-xs text-muted-foreground/20">·</span>
            <span className="text-xs text-muted-foreground/30">{group.items.length}</span>
          </div>
          <div className="space-y-0.5">
            {group.items.map((item, idx) => (
              <div key={idx}>{item}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
