// TODO: Review this file
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { cn } from '@/lib/utils'
import { Check, Film, Tv, Gamepad2, Music, Loader2 } from 'lucide-react'
import './preferences.scss'

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
    <div className="dk-settings-preferences__body">
      <div>
        <h2 className="dk-settings-preferences__title">Content Preferences</h2>
        <p className="dk-settings-preferences__desc">
          Manage your media preferences to personalize your home page.
        </p>
      </div>

      <div className="dk-settings-preferences__card">
        {/* Media Types */}
        <div>
          <p className="dk-settings-preferences__section-label">Preferred Media Types</p>
          <div className="dk-settings-preferences__media-grid">
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
                    'dk-settings-preferences__media-btn',
                    isSelected && 'dk-settings-preferences__media-btn--selected',
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
          <p className="dk-settings-preferences__section-label">Favorite Genres</p>
          {genresLoading ? (
            <div className="dk-settings-preferences__genre-list">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="dk-settings-preferences__genre-skeleton" />
              ))}
            </div>
          ) : (
            <div className="dk-settings-preferences__genre-list">
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
                      'dk-settings-preferences__genre-pill',
                      isSelected && 'dk-settings-preferences__genre-pill--selected',
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
          <p className="dk-settings-preferences__section-label">Language Preferences</p>
          <div className="dk-settings-preferences__lang-grid">
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
                    'dk-settings-preferences__lang-btn',
                    isSelected && 'dk-settings-preferences__lang-btn--selected',
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
        <div className="dk-settings-preferences__save-row">
          <DkButton onClick={handleSave} disabled={isSaving || selectedTypes.length === 0}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save Preferences
          </DkButton>
          {saved && (
            <span className="dk-settings-preferences__saved-indicator">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      {isAdult && (
        <div className="dk-settings-preferences__card">
          <div className="dk-settings-preferences__row">
            <div>
              <p className="dk-settings-preferences__row-label">Show 18+ Content</p>
              <p className="dk-settings-preferences__row-desc">
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
