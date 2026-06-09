// TODO: Review this file
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { DailyMoodCheckIn, type RecordedMoodContext } from '../molecules/daily-mood-check-in'
import { discoverQueries } from '@discover/discover-queries'
import { DiscoverHero } from './discover-hero'
import { useAuth } from '@/features/auth/auth-provider'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { useTodayWorkout, useCheckIn, useUndoCheckIn, useWorkouts, useDeleteWorkout } from '@/features/workout/workout-queries'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { groupWorkoutsByDay, formatVolume, type DayGroup } from '@/features/workout/lib/workout-stats'
import { WorkoutCard } from '@/features/workout/molecules/workout-card'
import { WorkoutHeatmap } from '@/features/workout/molecules/workout-heatmap'
import { Logo } from '@ui/atoms/logo'
import { Dumbbell, Flame, RotateCcw, CheckCircle2, Weight, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import './home-page.scss'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))
import { MediaSection } from './media-section'
import { TmdbConnectCallbackPage } from '@auth/organisms/tmdb-connect-callback-page'

const MEDIA_DOT_COLORS: Record<string, { active: string; inactive: string; text: string }> = {
  movie: {
    active: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]',
    inactive: 'bg-rose-500/30 hover:bg-rose-500/80',
    text: 'text-rose-400',
  },
  show: {
    active: 'bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]',
    inactive: 'bg-violet-500/30 hover:bg-violet-500/80',
    text: 'text-violet-400',
  },
  game: {
    active: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]',
    inactive: 'bg-emerald-500/30 hover:bg-emerald-500/80',
    text: 'text-emerald-400',
  },
  music: {
    active: 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]',
    inactive: 'bg-amber-500/30 hover:bg-amber-500/80',
    text: 'text-amber-400',
  },
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

interface WorkoutHomeContentProps {
  dayGroups: DayGroup[]
  isLoading: boolean
  isEmpty: boolean
  weeklyStats: { weekWorkouts: number; weekSets: number; weekVolume: number }
  workoutStreak: number
  isAuthenticated: boolean
  onDeleteWorkout: (id: string) => void
  isDeleting: boolean
  hasMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
}

function WorkoutHomeContent({
  dayGroups,
  isLoading,
  isEmpty,
  weeklyStats,
  workoutStreak,
  isAuthenticated,
  onDeleteWorkout,
  isDeleting,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: WorkoutHomeContentProps) {
  if (!isAuthenticated) return null

  return (
    <div className="dk-discover-home-page__workout-content">
      {/* Stats row */}
      <div className="dk-discover-home-page__workout-stats">
        <div className="dk-discover-home-page__stat-card">
          <div className="dk-discover-home-page__stat-card-value">{weeklyStats.weekWorkouts}</div>
          <div className="dk-discover-home-page__stat-card-label">This week</div>
        </div>
        <div className="dk-discover-home-page__stat-card">
          <div className="dk-discover-home-page__stat-card-value">{workoutStreak}</div>
          <div className="dk-discover-home-page__stat-card-label">Day streak</div>
        </div>
        <div className="dk-discover-home-page__stat-card">
          <div className="dk-discover-home-page__stat-card-value">{weeklyStats.weekSets}</div>
          <div className="dk-discover-home-page__stat-card-label">Sets</div>
        </div>
      </div>

      {/* Heatmap */}
      <WorkoutHeatmap weeks={52} />

      {/* History */}
      <div className="dk-discover-home-page__workout-history">
        <h2 className="dk-discover-home-page__workout-history-title">
          Recent Workouts
        </h2>

        {isLoading && (
          <div className="dk-discover-home-page__workout-loading">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {isEmpty && (
          <div className="dk-discover-home-page__workout-empty">
            <Dumbbell className="h-10 w-10 text-muted-foreground/20" />
            <p className="dk-discover-home-page__workout-empty-text">
              No workouts yet. Check in above to start your streak.
            </p>
          </div>
        )}

        {dayGroups.map((group) => (
          <div key={group.date} className="space-y-2">
            <div className="dk-discover-home-page__workout-day-header">
              <span className="dk-discover-home-page__workout-day-label">{group.label}</span>
              <div className="dk-discover-home-page__workout-day-stats">
                {group.estimatedKcal > 0 && (
                  <span className="flex items-center gap-1">
                    <Flame className="h-3 w-3" />
                    ~{group.estimatedKcal.toLocaleString()} kcal
                  </span>
                )}
                {group.totalVolumeKg > 0 && (
                  <span className="flex items-center gap-1">
                    <Weight className="h-3 w-3" />
                    {formatVolume(group.totalVolumeKg)}
                  </span>
                )}
              </div>
            </div>

            {group.workouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onDelete={onDeleteWorkout}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        ))}

        {hasMore && (
          <div className="dk-discover-home-page__workout-load-more">
            <button
              className="dk-discover-home-page__workout-load-more-btn"
              onClick={onLoadMore}
              disabled={isFetchingMore}
            >
              {isFetchingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function HomePage() {
  const search = new URLSearchParams(window.location.search)
  if (search.get('tmdb_connect') === '1' || search.has('tmdb_link')) {
    return <TmdbConnectCallbackPage />
  }

  return <HomeExperience />
}

function HomeExperience() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [activeSectionIndex, setActiveSectionIndex] = useState(0)

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ behavior: 'smooth', top })
    }
  }, [])

  const [isHovered, setIsHovered] = useState(false)
  const [greeting] = useState(() => getGreeting())
  const [isMoodPromptVisible, setIsMoodPromptVisible] = useState(false)
  const [moodNoteContext, setMoodNoteContext] = useState<RecordedMoodContext | null>(null)
  const [moodNote, setMoodNote] = useState('')
  const [moodNoteResetKey, setMoodNoteResetKey] = useState(0)
  const HOME_MODE_KEY = 'otix-home-mode'

  const [activeMode, setActiveMode] = useState<string>(() => {
    const stored = localStorage.getItem(HOME_MODE_KEY)
    return stored === 'workout' ? 'workout' : 'discover'
  })

  // Workout check-in — only fire when authenticated
  const todayWorkoutQuery = useTodayWorkout({ enabled: isAuthenticated })
  const checkInMutation = useCheckIn()
  const undoCheckInMutation = useUndoCheckIn()

  const todayWorkout = todayWorkoutQuery.data
  const isCheckedIn = todayWorkout?.checkedIn ?? false
  const workoutStreak = todayWorkout?.currentStreak ?? 0

  const handleModeChange = (modeId: string) => {
    // Cancel mood note flow when switching modes
    if (moodNoteContext) {
      setMoodNote('')
      setMoodNoteContext(null)
      setMoodNoteResetKey((key) => key + 1)
    }
    localStorage.setItem(HOME_MODE_KEY, modeId)
    setActiveMode(modeId)
  }

  const handleWorkoutCheckIn = () => {
    if (checkInMutation.isPending) return
    checkInMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.currentStreak > 0) {
          showXPToast(100)
        }
      },
    })
  }

  const handleWorkoutUndo = () => {
    if (undoCheckInMutation.isPending) return
    undoCheckInMutation.mutate()
  }

  // Workout history for workout home view — only fire when authenticated
  const workoutsQuery = useWorkouts({ enabled: isAuthenticated })
  const deleteWorkoutMutation = useDeleteWorkout()
  const workouts = workoutsQuery.data?.pages.flatMap((p) => p.items) ?? []
  const dayGroups = useMemo(() => groupWorkoutsByDay(workouts), [workouts])
  const isEmptyWorkoutHistory = !workoutsQuery.isLoading && workouts.length === 0

  // Weekly stats
  const weeklyStats = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)

    let weekWorkouts = 0
    let weekSets = 0
    let weekVolume = 0

    for (const w of workouts) {
      const d = new Date(w.startedAt)
      if (d >= weekStart) {
        weekWorkouts++
        weekSets += w.totalSets
        for (const ex of w.exercises) {
          for (const set of ex.sets) {
            if (set.weightKg != null) {
              weekVolume += set.reps * set.weightKg
            }
          }
        }
      }
    }

    return { weekWorkouts, weekSets, weekVolume }
  }, [workouts])

  const handleDeleteWorkout = (id: string) => {
    deleteWorkoutMutation.mutate(id)
  }

  const { data: sections = [] } = useQuery(discoverQueries.sections())

  // Merge hero, search, and API sections into a single nav list
  const navSections = useMemo(() => {
    const fixed: { id: string; title: string; mediaType?: string }[] = [
      { id: 'search', title: 'Search' },
      { id: 'slides', title: 'Slides' },
    ]
    return [...fixed, ...sections]
  }, [sections])

  useEffect(() => {
    if (navSections.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-30% 0px -30% 0px',
      threshold: 0,
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '')
          const idx = navSections.findIndex((s) => s.id === id)
          if (idx !== -1) {
            setActiveSectionIndex(idx)
          }
        }
      })
    }, observerOptions)

    navSections.forEach((section) => {
      const el = document.getElementById(`section-${section.id}`)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [navSections])

  const isMoodNoteMode = moodNoteContext != null

  const handleMoodRecorded = useCallback((context: RecordedMoodContext) => {
    if (context.feeling !== null) {
      setMoodNote('')
      setMoodNoteContext(null)
    } else {
      setMoodNoteContext(context)
    }
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      navigate({ to: '/search' })
    }
  }, [navigate])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="dk-discover-home-page">
      <Helmet>
        <title>Otix — Your media command center</title>
        <meta name="description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
        <meta property="og:title" content="Otix — Your media command center" />
        <meta property="og:description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={window.location.origin} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Otix — Your media command center" />
        <meta name="twitter:description" content="Discover movies, shows, games, and music. Track your workouts, build your library, and find your next obsession with Otix." />
      </Helmet>
      <Suspense fallback={null}>
        <AnimatedShaderBackground mode="idle" />
      </Suspense>

      <div className="dk-discover-home-page__content">
        {/* Logo hero */}
        <div
          className="dk-discover-home-page__hero"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: isHovered ? 1.03 : 1,
            }}
            transition={{ type: 'spring', stiffness: 150, damping: 20 }}
            className="dk-discover-home-page__logo-wrapper"
          >
            <Logo
              className="h-28 md:h-40 filter drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              color="rgba(255,255,255,0.65)"
            />
          </motion.div>
        </div>

        <div
          className="dk-discover-home-page__body"
        >
          <div className="dk-discover-home-page__search">
            <p className="dk-discover-home-page__greeting">
              {isMoodPromptVisible ? `${greeting}, how are you feeling today?` : greeting}
            </p>
            <div className="mb-3 w-full">
              <DailyMoodCheckIn
                noteComposerResetKey={moodNoteResetKey}
                onMoodRecorded={handleMoodRecorded}
                onPromptVisibleChange={setIsMoodPromptVisible}
              />
            </div>

            {/* Chat entry button */}
            <button
              onClick={() => navigate({ to: '/search' })}
              className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-medium bg-white/[0.04] text-foreground/70 ring-1 ring-white/[0.06] transition-all duration-200 hover:bg-white/[0.08] hover:text-foreground hover:ring-primary/20 hover:scale-[1.02] active:scale-[0.98] w-full max-w-[32rem]"
            >
              <MessageSquareText className="h-5 w-5" />
              <span>Chat with AI</span>
              <span className="ml-auto px-2 py-0.5 rounded-md text-[11px] font-mono bg-white/[0.06] text-muted-foreground/40">/</span>
            </button>

            {activeMode === 'workout' && !isMoodNoteMode ? (
              <div className="w-full max-w-3xl mt-4">
                <div className="dk-discover-home-page__workout-panel">
                  {isAuthenticated ? (
                    <div className="dk-discover-home-page__workout-panel-header">
                      <Flame className="h-5 w-5 shrink-0 text-primary/50" />
                      <div className="dk-discover-home-page__workout-panel-message">
                        {todayWorkoutQuery.isLoading
                          ? 'Loading...'
                          : isCheckedIn
                            ? "You've worked out today!"
                            : 'Tap to log today\'s workout'}
                      </div>
                      <div className="dk-discover-home-page__workout-panel-actions">
                        {isCheckedIn && !todayWorkoutQuery.isLoading && (
                          <div className="dk-discover-home-page__workout-panel-streak">
                            <Flame className="h-4 w-4" />
                            {workoutStreak}d streak
                          </div>
                        )}
                        {isCheckedIn ? (
                          <button
                            onClick={handleWorkoutUndo}
                            disabled={undoCheckInMutation.isPending || todayWorkoutQuery.isLoading}
                            className={cn(
                              'dk-discover-home-page__workout-btn',
                              'dk-discover-home-page__workout-btn--undo',
                            )}
                            aria-label="Undo workout check-in"
                          >
                            {todayWorkoutQuery.isLoading ? (
                              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={handleWorkoutCheckIn}
                            disabled={checkInMutation.isPending || todayWorkoutQuery.isLoading}
                            className={cn(
                              'dk-discover-home-page__workout-btn',
                              'dk-discover-home-page__workout-btn--checkin',
                            )}
                            aria-label="Log workout"
                          >
                            {todayWorkoutQuery.isLoading ? (
                              <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="dk-discover-home-page__workout-panel-header">
                      <Flame className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      <div className="dk-discover-home-page__workout-panel-message--muted">
                        Sign in to track your workouts
                      </div>
                    </div>
                  )}
                  <div className="dk-discover-home-page__workout-panel-modes">
                    <button
                      onClick={() => handleModeChange('discover')}
                      className="dk-discover-home-page__mode-btn dk-discover-home-page__mode-btn--discover"
                    >
                      Discover
                    </button>
                    <button
                      onClick={() => handleModeChange('workout')}
                      className="dk-discover-home-page__mode-btn dk-discover-home-page__mode-btn--workout"
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                      Workout
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <AnimatePresence mode="wait">
            {activeMode === 'workout' && !isMoodNoteMode ? (
              <motion.div
                key="workout"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                <WorkoutHomeContent
                  dayGroups={dayGroups}
                  isLoading={workoutsQuery.isLoading}
                  isEmpty={isEmptyWorkoutHistory}
                  weeklyStats={weeklyStats}
                  workoutStreak={workoutStreak}
                  isAuthenticated={isAuthenticated}
                  onDeleteWorkout={handleDeleteWorkout}
                  isDeleting={deleteWorkoutMutation.isPending}
                  hasMore={!!workoutsQuery.hasNextPage}
                  isFetchingMore={workoutsQuery.isFetchingNextPage}
                  onLoadMore={() => workoutsQuery.fetchNextPage()}
                />
              </motion.div>
            ) : (
              <motion.div
                key="discover"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="dk-discover-home-page__discover-sections"
              >
                {/* DiscoverHero carousel */}
                <div id="section-slides" className="w-full">
                  <DiscoverHero />
                </div>

                {/* Discover sections vertically stacked layout */}
                <div className="dk-discover-home-page__sections">
                  <QueryErrorBoundary>
                    {sections.map((section) => (
                      <div
                        key={section.id}
                        id={`section-${section.id}`}
                        className="dk-discover-home-page__section"
                      >
                        <MediaSection
                          title={section.title}
                          mediaType={(section.mediaType as 'movie' | 'show' | 'game' | 'music') || undefined}
                          listType={section.listType}
                          genre={section.genre}
                          language={section.language}
                          isAnime={section.isAnime}
                          reason={section.reason}
                        />
                      </div>
                    ))}
                  </QueryErrorBoundary>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Vertical Navigation Dots on the Side */}
      {activeMode === 'discover' && navSections.length > 1 && (
        <div className="dk-discover-home-page__nav-dots">
          {navSections.map((section, idx) => {
            const isActive = idx === activeSectionIndex
            const mType = section.mediaType
            const colorConfig = mType ? MEDIA_DOT_COLORS[mType] : null

            return (
              <div key={section.id} className="dk-discover-home-page__nav-dot-item group">
                <span className={cn(
                  "dk-discover-home-page__nav-dot-tooltip",
                  colorConfig?.text
                )}>
                  {section.title}
                </span>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "dk-discover-home-page__nav-dot",
                    isActive
                      ? cn("dk-discover-home-page__nav-dot--active", colorConfig?.active || "bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]")
                      : cn("dk-discover-home-page__nav-dot--inactive", colorConfig?.inactive || "bg-white/20 hover:bg-white/50")
                  )}
                  aria-label={`Scroll to ${section.title}`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
