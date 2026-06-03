import { useState } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { cn } from '@/lib/utils'
import { Check, Film, Tv, Gamepad2, Music, Loader2 } from 'lucide-react'

const MEDIA_TYPES = [
  { value: 'movie', label: 'Movies', Icon: Film, color: 'text-amber-400' },
  { value: 'show', label: 'Shows', Icon: Tv, color: 'text-violet-400' },
  { value: 'game', label: 'Games', Icon: Gamepad2, color: 'text-emerald-400' },
  { value: 'music', label: 'Music', Icon: Music, color: 'text-rose-400' },
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

export function PreferencesSection() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [selectedTypes, setSelectedTypes] = useState<string[]>(user?.preferredMediaTypes ?? ['movie', 'show', 'game', 'music'])
  const [selectedGenres, setSelectedGenres] = useState<string[]>(user?.preferredGenres ?? [])
  const [selectedLangs, setSelectedLangs] = useState<string[]>(user?.preferredLanguages ?? [])
  const [showAdultContent, setShowAdultContent] = useState(user?.showAdultContent ?? false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const userAge = (() => {
    if (!user?.dateOfBirth) return null
    const dob = new Date(user.dateOfBirth)
    if (isNaN(dob.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
    return age
  })()
  const isAdult = userAge !== null && userAge >= 18

  const { data: allGenres = [], isLoading: genresLoading } = useQuery({
    queryKey: ['genres', 'settings'],
    queryFn: async () => {
      const results = await Promise.all(
        MEDIA_TYPES.map(async (mt) => {
          const { data } = await apiClient.get<GenreOption[]>('/media/genres', { params: { media_type: mt.value } })
          return data
        }),
      )
      const seen = new Set<string>()
      const deduped: GenreOption[] = []
      for (const genre of results.flat()) {
        if (!seen.has(genre.slug)) {
          seen.add(genre.slug)
          deduped.push(genre)
        }
      }
      return deduped
    },
    staleTime: 1000 * 60 * 30,
  })

  const handleSave = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      await apiClient.patch('/auth/me', {
        preferred_media_types: selectedTypes,
        preferred_genres: selectedGenres,
        preferred_languages: selectedLangs,
      })
      await refreshUser()
      await queryClient.invalidateQueries({ queryKey: ['discover'] })
      setSaved(true)
    } catch { /* error handled silently */ }
    finally { setIsSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Content Preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your media preferences to personalize your home page.
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)] space-y-6">
        {/* Media Types */}
        <div>
          <p className="text-sm font-medium mb-3">Preferred Media Types</p>
          <div className="grid grid-cols-2 gap-2">
            {MEDIA_TYPES.map(({ value, label, Icon, color }) => {
              const isSelected = selectedTypes.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedTypes(prev =>
                    prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value],
                  )}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-[var(--dk-border)] bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className={cn('h-4 w-4', color)} />
                  {label}
                  {isSelected && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Genres */}
        <div>
          <p className="text-sm font-medium mb-3">Favorite Genres</p>
          {genresLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 w-20 rounded-full bg-[var(--dk-surface-glass)] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {allGenres.map(g => {
                const isSelected = selectedGenres.includes(g.slug)
                return (
                  <button
                    key={g.slug}
                    type="button"
                    onClick={() => setSelectedGenres(prev =>
                      prev.includes(g.slug) ? prev.filter(gg => gg !== g.slug) : [...prev, g.slug],
                    )}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {g.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Languages */}
        <div>
          <p className="text-sm font-medium mb-3">Language Preferences</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {LANGUAGES.map(({ code, label, flag }) => {
              const isSelected = selectedLangs.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedLangs(prev =>
                    prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code],
                  )}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-base">{flag}</span>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <DkButton onClick={handleSave} disabled={isSaving || selectedTypes.length === 0}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save Preferences
          </DkButton>
          {saved && (
            <span className="text-sm text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      {isAdult && (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show 18+ Content</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Include adult-rated media in search results and recommendations.
              </p>
            </div>
            <DkSwitch
              checked={showAdultContent}
              onCheckedChange={async (checked: boolean) => {
                setShowAdultContent(checked)
                try {
                  await apiClient.patch('/auth/me', { show_adult_content: checked })
                  await refreshUser()
                  await queryClient.invalidateQueries({ queryKey: ['discover'] })
                } catch { setShowAdultContent(!checked) }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
