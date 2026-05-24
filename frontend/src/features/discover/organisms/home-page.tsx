import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { DkTabs, DkTabList, DkTab } from '@/features/dk-ui/molecules/tabs'
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

  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<string>('all')
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

  // Workout check-in
  const todayWorkoutQuery = useTodayWorkout()
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

  // Workout history for workout home view
  const workoutsQuery = useWorkouts()
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

  const filteredSections = useMemo(
    () => sections.filter(s => activeType === 'all' || s.mediaType === activeType || !s.mediaType),
    [sections, activeType],
  )

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
    setMoodNoteContext(context)
  }, [])

  const handleMoodNoteSubmit = useCallback(async () => {
    if (!moodNoteContext || moodNoteSaving) return
    const note = moodNote.trim()
    setMoodNoteSaving(true)
    try {
      await apiClient.post('/mood-checkins', {
        feeling: moodNoteContext.feeling,
        mood: moodNoteContext.mood,
        note: note || null,
      })
      setMoodNote('')
      setMoodNoteContext(null)
      setMoodNoteResetKey((key) => key + 1)
    } finally {
      setMoodNoteSaving(false)
    }
  }, [moodNote, moodNoteContext, moodNoteSaving])

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
      <Suspense fallback={null}>
        <AnimatedShaderBackground mode="idle" />
      </Suspense>

      <div className="relative z-10 flex flex-col items-center px-4 pb-16 w-full">
        <div
          className={cn(
            'flex flex-col items-center w-full gap-6',
            activeMode !== 'workout' && 'min-h-[75vh] justify-center',
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
                modeLabel={isMoodNoteMode ? 'Note' : 'Discover'}
                showSubmitWhenEmpty={isMoodNoteMode}
                submitLabel={isMoodNoteMode ? 'Save note' : 'Search'}
                activeMode={activeMode}
                onModeChange={handleModeChange}
              />
            )}
          </div>

          {activeMode === 'workout' && !isMoodNoteMode ? (
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
          ) : (
            <>
            {/* DiscoverHero carousel */}
            <div className="w-full max-w-[1400px] mt-6 mb-12 rounded-[2rem] overflow-hidden bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] ring-1 ring-white/[0.04]">
              <DiscoverHero className="bg-transparent" />
            </div>

            {/* Discover sections */}
            <div className="w-full space-y-8">
              <div className="flex justify-center">
                <DkTabs defaultValue="all" value={activeType} onValueChange={setActiveType}>
                  <DkTabList>
                    {TYPE_TABS.map((tab) => (
                      <DkTab key={tab.value} value={tab.value}>
                        {tab.label}
                      </DkTab>
                    ))}
                  </DkTabList>
                </DkTabs>
              </div>

              <QueryErrorBoundary>
                {filteredSections.map((section) => (
                  <MediaSection
                  key={section.id}
                  title={section.title}
                  mediaType={(section.mediaType as 'movie' | 'show' | 'game' | 'music') || undefined}
                  listType={section.listType}
                  genre={section.genre}
                  language={section.language}
                  isAnime={section.isAnime}
                  reason={section.reason}
                />
              ))}
              </QueryErrorBoundary>
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  )
}
