import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { DkTabs, DkTabList, DkTab } from '@/features/dk-ui/molecules/tabs'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { DailyMoodCheckIn, type RecordedMoodContext } from '../molecules/daily-mood-check-in'
import { EmphasisSelector } from '../molecules/emphasis-selector'
import { discoverKeys } from '@discover/discover-keys'
import { discoverQueries, type PersonalizedSection } from '@discover/discover-queries'
import { DiscoverHero } from './discover-hero'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'

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

const DEFAULT_SECTIONS: PersonalizedSection[] = [
  { id: 'trending_movies', title: 'Trending Movies', mediaType: 'movie', listType: 'trending', genre: null, language: null, isAnime: null, isPersonalized: false, reason: null },
  { id: 'trending_shows', title: 'Trending Shows', mediaType: 'show', listType: 'trending', genre: null, language: null, isAnime: null, isPersonalized: false, reason: null },
  { id: 'popular_games', title: 'Popular Games', mediaType: 'game', listType: 'popular', genre: null, language: null, isAnime: null, isPersonalized: false, reason: null },
  { id: 'new_music', title: 'New Music', mediaType: 'music', listType: 'popular', genre: null, language: null, isAnime: null, isPersonalized: false, reason: null },
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
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
  const [moodNoteSaving, setMoodNoteSaving] = useState(false)
  const [emphases, setEmphases] = useState<string[]>(user?.discoverEmphases ?? [])
  const queryClient = useQueryClient()
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
  }, [query])

  // Fetch personalized sections (or fall back to defaults)
  const { data: sections = DEFAULT_SECTIONS } = useQuery({
    ...discoverQueries.sections(),
    enabled: isAuthenticated,
  })

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

  const handleEmphasesChange = useCallback((newEmphases: string[]) => {
    setEmphases(newEmphases)
    queryClient.invalidateQueries({ queryKey: discoverKeys.sections() })
  }, [queryClient])

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
        <div className="min-h-[75vh] flex flex-col justify-center items-center w-full gap-6">
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
            />
          </div>
        </div>

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

          {isAuthenticated && (
            <div className="flex justify-center">
              <EmphasisSelector emphases={emphases} onChange={handleEmphasesChange} />
            </div>
          )}

          {sections.filter(s => activeType === 'all' || s.mediaType === activeType || !s.mediaType).map((section) => (
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
        </div>
      </div>
    </div>
  )
}
