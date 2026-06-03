import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { DkTabs, DkTabList, DkTab } from '@/features/dk-ui/molecules/tabs'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { DailyMoodCheckIn, type RecordedMoodContext } from '../molecules/daily-mood-check-in'
import { discoverQueries } from '@discover/discover-queries'
import { DiscoverHero } from './discover-hero'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'
import { QueryErrorBoundary } from '@/components/query-error-boundary'
import { useTodayWorkout, useCheckIn, useUndoCheckIn, useWorkouts, useDeleteWorkout } from '@/features/workout/workout-queries'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { groupWorkoutsByDay, formatVolume, type DayGroup } from '@/features/workout/lib/workout-stats'
import { WorkoutCard } from '@/features/workout/molecules/workout-card'
import { WorkoutHeatmap } from '@/features/workout/molecules/workout-heatmap'
import { Logo } from '@ui/atoms/logo'
import { Dumbbell, Flame, RotateCcw, CheckCircle2, Weight } from 'lucide-react'
import { cn } from '@/lib/utils'

const AnimatedShaderBackground = lazy(() => import('@/components/animated-shader-background'))
import { MediaSection } from './media-section'
import { TmdbConnectCallbackPage } from '@auth/organisms/tmdb-connect-callback-page'

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
] as const

const PLACEHOLDERS = [
  'Find your next obsession...',
  'Cue up a cozy night pick...',
  'Chase a new gaming rabbit hole...',
  'What vibe are we on today?',
]

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
    <div className="w-full max-w-2xl mx-auto mt-6 space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04] p-4 text-center">
          <div className="text-2xl font-extrabold tabular-nums">{weeklyStats.weekWorkouts}</div>
          <div className="text-xs text-muted-foreground/60 mt-0.5">This week</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04] p-4 text-center">
          <div className="text-2xl font-extrabold tabular-nums">{workoutStreak}</div>
          <div className="text-xs text-muted-foreground/60 mt-0.5">Day streak</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04] p-4 text-center">
          <div className="text-2xl font-extrabold tabular-nums">{weeklyStats.weekSets}</div>
          <div className="text-xs text-muted-foreground/60 mt-0.5">Sets</div>
        </div>
      </div>

      {/* Heatmap */}
      <WorkoutHeatmap weeks={52} />

      {/* History */}
      <div className="space-y-6">
        <h2 className="text-sm font-semibold text-muted-foreground/60 uppercase tracking-wider">
          Recent Workouts
        </h2>

        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Dumbbell className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">
              No workouts yet. Check in above to start your streak.
            </p>
          </div>
        )}

        {dayGroups.map((group) => (
          <div key={group.date} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{group.label}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground/50">
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
          <div className="flex justify-center pt-2">
            <button
              className="text-sm text-primary hover:underline"
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
  const searchParams = useSearch({ from: '/' })
  const queryClient = useQueryClient()
  const activeType = searchParams.type || 'all'

  const [activeSectionIndex, setActiveSectionIndex] = useState(0)

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const [query, setQuery] = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [greeting] = useState(() => getGreeting())
  const [isMoodPromptVisible, setIsMoodPromptVisible] = useState(false)
  const [moodNoteContext, setMoodNoteContext] = useState<RecordedMoodContext | null>(null)
  const [moodNote, setMoodNote] = useState('')
  const [moodNoteResetKey, setMoodNoteResetKey] = useState(0)
  const HOME_MODE_KEY = 'otix-home-mode'

  const [moodNoteSaving, setMoodNoteSaving] = useState(false)
  const [activeMode, setActiveMode] = useState<string>(() => {
    const stored = localStorage.getItem(HOME_MODE_KEY)
    return stored === 'workout' ? 'workout' : 'discover'
  })
  const searchInputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Redirect new users to onboarding
  useEffect(() => {
    if (isAuthenticated && user && !user.onboardingCompleted) {
      navigate({ to: '/onboarding', replace: true })
    }
  }, [isAuthenticated, user, navigate])

  // Navigate to search page when a query is entered
  useEffect(() => {
    if (query.length > 0) {
      navigate({
        to: '/search',
        search: { q: query, type: activeType, sort: '' },
      })
    }
  }, [query, activeType, navigate])

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

  useEffect(() => {
    if (sections.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-40% 0px -40% 0px',
      threshold: 0,
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '')
          const idx = sections.findIndex((s) => s.id === id)
          if (idx !== -1) {
            setActiveSectionIndex(idx)
          }
        }
      })
    }, observerOptions)

    sections.forEach((section) => {
      const el = document.getElementById(`section-${section.id}`)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [sections])

  // Rotate placeholder text
  useEffect(() => {
    if (query) return
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [query])

  const isMoodNoteMode = moodNoteContext != null

  useEffect(() => {
    if (isMoodNoteMode) {
      setMoodNote('')
      inputRef.current?.focus()
    }
  }, [isMoodNoteMode])

  const handleMoodRecorded = useCallback((context: RecordedMoodContext) => {
    if (context.feeling !== null) {
      setMoodNote('')
      setMoodNoteContext(null)
    } else {
      setMoodNoteContext(context)
    }
  }, [])

  const handleMoodNoteSubmit = useCallback(async () => {
    if (!moodNoteContext || moodNoteSaving) return
    const note = moodNote.trim()
    setMoodNoteSaving(true)
    try {
      const { data } = await apiClient.post('/mood-checkins', {
        feeling: moodNoteContext.feeling,
        mood: moodNoteContext.mood,
        note: note || null,
      })
      queryClient.setQueryData(['mood-checkins', 'today'], { due: false, checkin: data })
      showXPToast(10)
      setMoodNote('')
      setMoodNoteContext(null)
      setMoodNoteResetKey((key) => key + 1)
    } finally {
      setMoodNoteSaving(false)
    }
  }, [moodNote, moodNoteContext, moodNoteSaving, queryClient])

  // Pre-warm the API connection when the search input receives focus
  const prewarmedRef = useRef(false)
  const handleSearchFocus = useCallback(() => {
    if (!prewarmedRef.current) {
      prewarmedRef.current = true
      apiClient.get('/health')
    }
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      if (e.key === 'Escape' && target === inputRef.current) {
        if (moodNoteContext) {
          setMoodNote('')
          setMoodNoteContext(null)
          setMoodNoteResetKey((key) => key + 1)
        } else {
          setQuery('')
        }
        ;(target as HTMLInputElement).blur()
      }
      return
    }

    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault()
      inputRef.current?.focus()
    }
  }, [moodNoteContext])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="relative min-h-[calc(100vh-5rem)]">
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

      <div className="relative z-10 flex flex-col items-center px-4 pb-16 w-full">
        {/* Logo hero — 50vh with dynamic float */}
        <div
          className="h-[50vh] flex items-center justify-center w-full relative"
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
            className="relative z-10 select-none group cursor-default"
          >
            <Logo
              className="h-32 md:h-48 lg:h-56 filter drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
              color="rgba(255,255,255,0.65)"
            />
          </motion.div>
        </div>

        <div
          className={cn(
            'flex flex-col items-center w-full gap-6',
          )}
        >
          <div ref={searchInputRef} className="w-full max-w-3xl flex flex-col items-center">
            <p className="text-muted-foreground text-sm md:text-base font-medium mb-3">
              {isMoodPromptVisible ? `${greeting}, how are you feeling today?` : greeting}
            </p>
            <div className="mb-3 w-full">
              <DailyMoodCheckIn
                noteComposerResetKey={moodNoteResetKey}
                onMoodRecorded={handleMoodRecorded}
                onPromptVisibleChange={setIsMoodPromptVisible}
              />
            </div>
            {activeMode === 'workout' && !isMoodNoteMode ? (
              <div className="w-full max-w-3xl">
                <div
                  className={cn(
                    'relative rounded-[2rem]',
                    'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
                    'backdrop-blur-xl shadow-[var(--dk-shadow-glass)]',
                    'ring-1 ring-white/[0.04]',
                  )}
                >
                  {isAuthenticated ? (
                    <div className="flex items-center gap-3 px-5 pt-5 pb-2">
                      <Flame className="h-5 w-5 shrink-0 text-primary/50" />
                      <div className="flex-1 min-w-0 h-12 md:h-14 flex items-center text-lg md:text-xl text-muted-foreground/60">
                        {todayWorkoutQuery.isLoading
                          ? 'Loading...'
                          : isCheckedIn
                            ? "You've worked out today!"
                            : 'Tap to log today\'s workout'}
                      </div>
                      <div className="flex items-center gap-2">
                        {isCheckedIn && !todayWorkoutQuery.isLoading && (
                          <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                            <Flame className="h-4 w-4" />
                            {workoutStreak}d streak
                          </div>
                        )}
                        {isCheckedIn ? (
                          <button
                            onClick={handleWorkoutUndo}
                            disabled={undoCheckInMutation.isPending || todayWorkoutQuery.isLoading}
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                              'bg-muted/20 text-muted-foreground',
                              'hover:bg-muted/30 hover:scale-105',
                              'active:scale-95',
                              'transition-all duration-200',
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
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                              'bg-primary/20 text-primary',
                              'hover:bg-primary/30 hover:scale-105',
                              'active:scale-95',
                              'transition-all duration-200',
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
                    <div className="flex items-center gap-3 px-5 pt-5 pb-2">
                      <Flame className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      <div className="flex-1 min-w-0 h-12 md:h-14 flex items-center text-lg md:text-xl text-muted-foreground/40">
                        Sign in to track your workouts
                      </div>
                    </div>
                  )}
                  {/* Mode tags */}
                  <div className="flex items-center gap-2 px-5 pb-4">
                    <button
                      onClick={() => handleModeChange('discover')}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium',
                        'transition-all duration-200',
                        'bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                      )}
                    >
                      Discover
                    </button>
                    <button
                      onClick={() => handleModeChange('workout')}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                        'transition-all duration-200',
                        'bg-primary/15 text-primary ring-1 ring-primary/20',
                      )}
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                      Workout
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ChatSearchInput
                ref={inputRef}
                value={isMoodNoteMode ? moodNote : query}
                onChange={isMoodNoteMode ? setMoodNote : setQuery}
                onTypeChange={isMoodNoteMode ? undefined : (t) => setActiveType(t || 'all')}
                activeType={isMoodNoteMode ? undefined : activeType === 'all' ? null : activeType}
                onSubmit={isMoodNoteMode ? handleMoodNoteSubmit : undefined}
                onFocus={isMoodNoteMode ? undefined : handleSearchFocus}
                placeholder={
                  isMoodNoteMode
                    ? `Optional note for ${moodNoteContext.label.toLowerCase()}`
                    : query
                      ? 'Search...'
                      : PLACEHOLDERS[placeholderIndex]
                }
                disabled={moodNoteSaving}
                debounceMs={isMoodNoteMode ? 0 : 150}
                leadingIcon={isMoodNoteMode ? moodNoteContext.Icon : undefined}
                showSubmitWhenEmpty={isMoodNoteMode}
                submitLabel={isMoodNoteMode ? 'Save note' : 'Search'}
                activeMode={activeMode}
                onModeChange={handleModeChange}
              />
            )}
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
                className="w-full flex flex-col items-center gap-6"
              >
                {/* DiscoverHero carousel */}
                <div className="w-full max-w-[1400px] mt-6 mb-12 rounded-[2rem] overflow-hidden bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04]">
                  <DiscoverHero className="bg-transparent" />
                </div>

                {/* Discover sections vertically stacked layout */}
                <div className="w-full flex flex-col gap-12">
                  <QueryErrorBoundary>
                    {sections.map((section) => (
                      <div
                        key={section.id}
                        id={`section-${section.id}`}
                        className="w-full px-4 lg:px-8 scroll-mt-24"
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
      {activeMode === 'discover' && sections.length > 1 && (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4 bg-black/20 backdrop-blur-md px-3 py-5 rounded-full shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04]">
          {sections.map((section, idx) => {
            const isActive = idx === activeSectionIndex
            const mType = section.mediaType
            const colorConfig = mType ? MEDIA_DOT_COLORS[mType] : null

            return (
              <div key={section.id} className="group relative flex items-center justify-end">
                <span className={cn(
                  "absolute right-8 text-[11px] font-bold text-white/90 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 opacity-0 scale-90 origin-right group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-md",
                  colorConfig?.text
                )}>
                  {section.title}
                </span>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "rounded-full cursor-pointer transition-all duration-300 outline-none",
                    isActive 
                      ? cn("w-2.5 h-6", colorConfig?.active || "bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]") 
                      : cn("w-2.5 h-2.5 hover:scale-110", colorConfig?.inactive || "bg-white/20 hover:bg-white/50")
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
