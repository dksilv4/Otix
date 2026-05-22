import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Film, Tv, Gamepad2, Music, ChevronRight, Check, Loader2, ArrowLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { cn } from '@/lib/utils'

const MEDIA_TYPES = [
  { value: 'movie', label: 'Movies', Icon: Film, color: 'text-amber-400', hue: 'amber' },
  { value: 'show', label: 'Shows', Icon: Tv, color: 'text-violet-400', hue: 'violet' },
  { value: 'game', label: 'Games', Icon: Gamepad2, color: 'text-emerald-400', hue: 'emerald' },
  { value: 'music', label: 'Music', Icon: Music, color: 'text-rose-400', hue: 'rose' },
] as const

const LANGUAGES = [
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'pt-PT', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'pt-BR', label: 'Brazilian', flag: '🇧🇷' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'th', label: 'Thai', flag: '🇹🇭' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷' },
  { code: 'pl', label: 'Polish', flag: '🇵🇱' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
]

interface GenreOption {
  id: string
  name: string
  slug: string
}

interface GenreWithSource extends GenreOption {
  sources: string[]
}

type Step = 'types' | 'genres' | 'languages' | 'summary'
const STEPS: Step[] = ['types', 'genres', 'languages', 'summary']

const STORAGE_KEY = 'otix-onboarding'

interface SavedProgress {
  selectedTypes: string[]
  selectedGenres: string[]
  selectedLangs: string[]
  step: Step
}

function loadProgress(): SavedProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedProgress
  } catch {
    return null
  }
}

function saveProgress(state: SavedProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded — silently ignore */ }
}

function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* silently ignore */ }
}

const HUE_RING: Record<string, string> = {
  amber: 'ring-amber-400/30',
  violet: 'ring-violet-400/30',
  emerald: 'ring-emerald-400/30',
  rose: 'ring-rose-400/30',
}

const HUE_BG: Record<string, string> = {
  amber: 'bg-amber-400/8',
  violet: 'bg-violet-400/8',
  emerald: 'bg-emerald-400/8',
  rose: 'bg-rose-400/8',
}

const HUE_TEXT: Record<string, string> = {
  amber: 'text-amber-300',
  violet: 'text-violet-300',
  emerald: 'text-emerald-300',
  rose: 'text-rose-300',
}

export function OnboardingPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { from?: string }
  const fromSettings = search.from === 'settings'

  const saved = useMemo(() => loadProgress(), [])

  const [step, setStep] = useState<Step>(saved?.step ?? 'types')
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    saved?.selectedTypes ?? user?.preferredMediaTypes ?? ['movie', 'show', 'game', 'music'],
  )
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    saved?.selectedGenres ?? user?.preferredGenres ?? [],
  )
  const [selectedLangs, setSelectedLangs] = useState<string[]>(
    saved?.selectedLangs ?? user?.preferredLanguages ?? [],
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist progress to localStorage on every change
  useEffect(() => {
    saveProgress({ selectedTypes, selectedGenres, selectedLangs, step })
  }, [selectedTypes, selectedGenres, selectedLangs, step])

  useEffect(() => {
    if (user?.onboardingCompleted && !fromSettings) {
      navigate({ to: '/', replace: true })
    }
  }, [user, fromSettings, navigate])

  // Preload all genres on mount — across all media types so the genres step is instant
  const { data: allGenres = [], isLoading: genresLoading } = useQuery({
    queryKey: ['genres', 'onboarding'],
    queryFn: async () => {
      const results = await Promise.all(
        MEDIA_TYPES.map(async (mt) => {
          const { data } = await apiClient.get<GenreOption[]>('/media/genres', { params: { media_type: mt.value } })
          return { mediaType: mt.value, genres: data }
        }),
      )
      // Merge deduped, tracking sources per genre
      const map = new Map<string, GenreWithSource>()
      for (const { mediaType, genres } of results) {
        for (const g of genres) {
          const existing = map.get(g.slug)
          if (existing) {
            if (!existing.sources.includes(mediaType)) {
              existing.sources.push(mediaType)
            }
          } else {
            map.set(g.slug, { ...g, sources: [mediaType] })
          }
        }
      }
      return Array.from(map.values())
    },
    staleTime: 1000 * 60 * 30,
  })

  const stepIndex = STEPS.indexOf(step)

  const handleNext = () => {
    if (step === 'types' && selectedTypes.length === 0) return
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next)
  }

  const handleBack = () => {
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      await apiClient.post('/onboarding', {
        preferred_media_types: selectedTypes,
        preferred_genres: selectedGenres,
        preferred_languages: selectedLangs,
      })
      await refreshUser()
      clearProgress()
      navigate({ to: fromSettings ? '/settings' : '/', replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to save preferences. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="mb-10">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const isCurrent = i === stepIndex
              const isPast = i < stepIndex
              return (
                <div key={s} className="flex-1 flex items-center gap-1.5">
                  <div
                    className={cn(
                      'h-1.5 rounded-full flex-1 transition-all duration-300',
                      isCurrent ? 'bg-primary shadow-sm shadow-primary/30' : isPast ? 'bg-primary/60' : 'bg-[var(--dk-surface-glass)]',
                    )}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'text-[11px] font-medium transition-colors',
                  i <= stepIndex ? 'text-foreground' : 'text-muted-foreground/40',
                )}
              >
                {s === 'types' ? 'Types' : s === 'genres' ? 'Genres' : s === 'languages' ? 'Languages' : 'Review'}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[360px]">
          {step === 'types' && (
            <TypesStep
              selected={selectedTypes}
              onToggle={(v) => setSelectedTypes(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v])}
              onNext={handleNext}
            />
          )}

          {step === 'genres' && (
            <GenresStep
              selectedTypes={selectedTypes}
              allGenres={allGenres}
              isLoading={genresLoading}
              selected={selectedGenres}
              onToggle={(slug) => setSelectedGenres(prev => prev.includes(slug) ? prev.filter(g => g !== slug) : [...prev, slug])}
              onBack={handleBack}
              onNext={handleNext}
            />
          )}

          {step === 'languages' && (
            <LanguagesStep
              selected={selectedLangs}
              onToggle={(code) => setSelectedLangs(prev => prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code])}
              onBack={handleBack}
              onNext={handleNext}
            />
          )}

          {step === 'summary' && (
            <SummaryStep
              selectedTypes={selectedTypes}
              selectedGenres={selectedGenres}
              selectedLangs={selectedLangs}
              error={error}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step: Media Types ──

function TypesStep({ selected, onToggle, onNext }: {
  selected: string[]
  onToggle: (v: string) => void
  onNext: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">What are you into?</h1>
        <p className="text-sm text-muted-foreground">Pick the types of content you enjoy.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MEDIA_TYPES.map(({ value, label, Icon, color }) => {
          const isSelected = selected.includes(value)
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                'flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200',
                isSelected
                  ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                  : 'border-[var(--dk-border)] bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)]',
              )}
            >
              <Icon className={cn('h-10 w-10', color)} />
              <span className="text-sm font-semibold text-foreground">{label}</span>
              {isSelected && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex justify-end">
        <DkButton onClick={onNext} disabled={selected.length === 0}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </DkButton>
      </div>
    </div>
  )
}

// ── Step: Genres ──

function GenresStep({ selectedTypes, allGenres, isLoading, selected, onToggle, onBack, onNext }: {
  selectedTypes: string[]
  allGenres: GenreWithSource[]
  isLoading: boolean
  selected: string[]
  onToggle: (slug: string) => void
  onBack: () => void
  onNext: () => void
}) {
  // Filter to only genres present in the currently selected media types
  const visibleGenres = useMemo(
    () => allGenres.filter(g => g.sources.some(s => selectedTypes.includes(s))),
    [allGenres, selectedTypes],
  )

  // Map source media type to hue class
  const genreHue = (g: GenreWithSource) => {
    const primary = g.sources[0]
    const def = MEDIA_TYPES.find(mt => mt.value === primary)
    return def?.hue ?? null
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">What genres do you like?</h1>
        <p className="text-sm text-muted-foreground">Pick the genres that appeal to you.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-10 rounded-full bg-[var(--dk-surface-glass)] animate-pulse" />
          ))}
        </div>
      ) : visibleGenres.length > 0 ? (
        <div className="flex flex-wrap gap-2 justify-center">
          {visibleGenres.map(g => {
            const isSelected = selected.includes(g.slug)
            const hue = genreHue(g)
            const isMultiSource = g.sources.length > 1

            return (
              <button
                key={g.slug}
                type="button"
                onClick={() => onToggle(g.slug)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : hue && !isMultiSource
                      ? cn(
                          'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)]',
                          'ring-1',
                          HUE_RING[hue],
                          HUE_BG[hue],
                          HUE_TEXT[hue],
                        )
                      : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
                )}
              >
                {g.name}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">No genres available for the selected types.</p>
      )}

      <div className="flex items-center justify-between">
        <DkButton variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </DkButton>
        <DkButton onClick={onNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </DkButton>
      </div>
    </div>
  )
}

// ── Step: Languages ──

function LanguagesStep({ selected, onToggle, onBack, onNext }: {
  selected: string[]
  onToggle: (code: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Any language preferences?</h1>
        <p className="text-sm text-muted-foreground">Select content languages you enjoy — like anime, K-dramas, or Latin music.</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {LANGUAGES.map(({ code, label, flag }) => {
          const isSelected = selected.includes(code)
          return (
            <button
              key={code}
              type="button"
              onClick={() => onToggle(code)}
              className={cn(
                'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
              )}
            >
              <span className="text-lg">{flag}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <DkButton variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </DkButton>
        <DkButton onClick={onNext}>
          Review
          <ChevronRight className="h-4 w-4 ml-1" />
        </DkButton>
      </div>
    </div>
  )
}

// ── Step: Summary ──

function SummaryStep({ selectedTypes, selectedGenres, selectedLangs, error, isSubmitting, onBack, onSubmit }: {
  selectedTypes: string[]
  selectedGenres: string[]
  selectedLangs: string[]
  error: string | null
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">You're all set</h1>
        <p className="text-sm text-muted-foreground">Here's what we'll use to personalize your home page.</p>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-glass)] p-6 space-y-5 ring-1 ring-white/[0.04]">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Content Types</p>
          <div className="flex flex-wrap gap-2">
            {selectedTypes.map(type => {
              const def = MEDIA_TYPES.find(t => t.value === type)
              if (!def) return null
              const { Icon, label, color } = def
              return (
                <span key={type} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-base)] px-3 py-1.5 text-sm font-medium text-foreground">
                  <Icon className={cn('h-3.5 w-3.5', color)} />
                  {label}
                </span>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Genres</p>
          {selectedGenres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedGenres.map(g => (
                <span key={g} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {g.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No specific genres selected</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Languages</p>
          {selectedLangs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedLangs.map(code => {
                const lang = LANGUAGES.find(l => l.code === code)
                return (
                  <span key={code} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {lang ? `${lang.flag} ${lang.label}` : code}
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No language preferences</p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <DkButton variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </DkButton>
        <DkButton onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Start Exploring
        </DkButton>
      </div>
    </div>
  )
}
