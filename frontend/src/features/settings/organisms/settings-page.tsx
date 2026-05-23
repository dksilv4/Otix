import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { Moon, Sun, User, Palette, Shield, Pencil, Plus, X, Link2, Upload, Image, Check, ShieldAlert, Loader2, Monitor, Unlink, RefreshCw, Download, GripVertical, ChevronDown, Heart, Film, Tv, Gamepad2, Music } from 'lucide-react'
import { CropModal } from '@/features/settings/molecules/crop-modal'
import { SHADER_QUALITY_OPTIONS, useShaderQuality } from '@/lib/shader-quality'
import { MOTION_OPTIONS, useMotionPreference } from '@/lib/motion-preference'
import { useTheme, type ThemeSetting } from '@/lib/theme'
import { useAuth } from '@/features/auth/auth-provider'
import { useQuery } from '@tanstack/react-query'
import { fetchSessions, revokeSession, revokeOtherSessions, type SessionInfo } from '@/features/auth/session-queries'
import { apiClient, API_BASE_URL } from '@/lib/api-client'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'

import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { DkInput } from '@/features/dk-ui/atoms/input'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { SpotifyIcon } from '@/features/dk-ui/atoms/spotify-icon'
import { GoogleIcon } from '@/features/dk-ui/atoms/google-icon'
import { TmdbIcon } from '@/features/dk-ui/atoms/tmdb-icon'

const BIO_MAX_LENGTH = 250

type Section = 'profile' | 'preferences' | 'appearance' | 'account' | 'integrations'

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Heart },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'account', label: 'Account', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
]

function isSettingsSection(value: unknown): value is Section {
  return typeof value === 'string' && NAV_ITEMS.some((item) => item.id === value)
}

export function SettingsPage() {
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>(() =>
    isSettingsSection(search.section) ? search.section : 'profile',
  )
  const [mobileView, setMobileView] = useState<'menu' | 'section'>('menu')
  const { theme, setTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()

  const handleSectionChange = (section: Section) => {
    setActiveSection(section)
    setMobileView('section')
    navigate({
      to: '/settings',
      search: section === 'profile' ? {} : ({ section } as never),
      replace: true,
    })
  }

  const handleBackToMenu = () => {
    setMobileView('menu')
  }

  return (
    <div className="mx-auto lg:max-w-5xl pb-16">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      <div className="mt-6 md:flex md:gap-8">
        {/* Mobile menu page */}
        <div className={cn('md:hidden', mobileView === 'section' && 'hidden')}>
          <h1 className="mb-6 text-2xl font-bold tracking-[-0.02em]">Settings</h1>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-base font-medium transition-all active:scale-[0.98] hover:bg-[var(--dk-surface-glass)]"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span>{item.label}</span>
                  <ChevronDown className="h-4 w-4 ml-auto -rotate-90 text-muted-foreground/40" />
                </button>
              )
            })}
          </nav>

          {user && (
            <div className="mt-8 px-4 pt-6 border-t border-border/40">
              <div className="flex items-center gap-3">
                <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.username}
                    {user.isAdmin && (
                      <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <h1 className="px-3 mb-4 text-lg font-bold tracking-[-0.02em]">Settings</h1>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {user && (
              <div className="mt-8 px-3 pt-6 border-t border-border/40">
                <div className="flex items-center gap-3">
                  <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.username}
                      {user.isAdmin && (
                        <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content area */}
        <main className={cn('flex-1 min-w-0', mobileView === 'menu' && 'hidden md:block')}>
          {/* Mobile back button */}
          <button
            onClick={handleBackToMenu}
            className="md:hidden flex items-center gap-2 mb-6 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
            Settings
          </button>
          {activeSection === 'profile' && (
            <ProfileSection user={user} isAuthenticated={isAuthenticated} />
          )}
          {activeSection === 'preferences' && (
            <PreferencesSection />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection theme={theme} onSetTheme={setTheme} />
          )}
          {activeSection === 'account' && (
            <AccountSection user={user} isAuthenticated={isAuthenticated} />
          )}
          {activeSection === 'integrations' && (
            <IntegrationsSection />
          )}
        </main>
      </div>
    </div>
  )
}

const VISIBILITY_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends only' },
  { value: 'hidden', label: 'Hidden' },
]

const PROFILE_SECTION_OPTIONS = [
  { id: 'reviews', label: 'Reviews', description: 'Show your written reviews' },
  { id: 'stats', label: 'Activity Stats', description: 'XP, review count, and activity breakdown' },
  { id: 'top_rated', label: 'Top Rated', description: 'Your highest-rated media items' },
  { id: 'recent_activity', label: 'Recent Activity', description: 'Timeline of recent actions' },
] as const

// ── Preferences ──

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

function PreferencesSection() {
  const { user, refreshUser } = useAuth()
  const [selectedTypes, setSelectedTypes] = useState<string[]>(user?.preferredMediaTypes ?? ['movie', 'show', 'game', 'music'])
  const [selectedGenres, setSelectedGenres] = useState<string[]>(user?.preferredGenres ?? [])
  const [selectedLangs, setSelectedLangs] = useState<string[]>(user?.preferredLanguages ?? [])
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
    </div>
  )
}

// ── Profile ──

function ProfileSection({
  user,
  isAuthenticated,
}: {
  user: {
    email: string
    username: string
    isAdmin?: boolean
    bio?: string | null
    avatarUrl?: string | null
    backgroundUrl?: string | null
    steamId?: string | null
    plexId?: string | null
    tmdbUsername?: string | null
    integrationVisibility?: Record<string, string> | null
    profileCardSections?: string[] | null
  } | null
  isAuthenticated: boolean
}) {
  const { refreshUser } = useAuth()
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(user?.backgroundUrl ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [steamVisibility, setSteamVisibility] = useState(
    user?.integrationVisibility?.steam ?? 'hidden'
  )
  const [plexVisibility, setPlexVisibility] = useState(
    user?.integrationVisibility?.plex ?? 'hidden'
  )
  const [tmdbVisibility, setTmdbVisibility] = useState(
    user?.integrationVisibility?.tmdb ?? 'hidden'
  )
  const [profileSections, setProfileSections] = useState<string[]>(
    user?.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'],
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [editingCover, setEditingCover] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (user && !initialized) {
      setAvatarUrl(user.avatarUrl ?? '')
      setBackgroundUrl(user.backgroundUrl ?? '')
      setBio(user.bio ?? '')
      setSteamVisibility(user.integrationVisibility?.steam ?? 'hidden')
      setPlexVisibility(user.integrationVisibility?.plex ?? 'hidden')
      setTmdbVisibility(user.integrationVisibility?.tmdb ?? 'hidden')
      setProfileSections(user.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'])
      setInitialized(true)
    }
  }, [user, initialized])

  if (!isAuthenticated || !user) {
    return (
      <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
        <User className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to customize your profile.</p>
        </div>
        <Link
          to="/auth/login"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: avatarUrl || null,
        background_url: backgroundUrl || null,
        integration_visibility: integrationVisibility,
        profile_card_sections: profileSections,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
      refreshUser()
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const integrationVisibility = { steam: steamVisibility, plex: plexVisibility, tmdb: tmdbVisibility }

  const hasChanges =
    bio !== (user?.bio ?? '') ||
    avatarUrl !== (user?.avatarUrl ?? '') ||
    backgroundUrl !== (user?.backgroundUrl ?? '') ||
    steamVisibility !== (user?.integrationVisibility?.steam ?? 'hidden') ||
    plexVisibility !== (user?.integrationVisibility?.plex ?? 'hidden') ||
    tmdbVisibility !== (user?.integrationVisibility?.tmdb ?? 'hidden') ||
    JSON.stringify(profileSections) !== JSON.stringify(user?.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'])

  const applyCoverEditor = async (url: string, keepOpen = false) => {
    setBackgroundUrl(url)
    if (!keepOpen) setEditingCover(false)
    setSaving(true)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: avatarUrl || null,
        background_url: url || null,
        integration_visibility: integrationVisibility,
        profile_card_sections: profileSections,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
      refreshUser()
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const applyAvatarEditor = async (url: string, keepOpen = false) => {
    setAvatarUrl(url)
    if (!keepOpen) setEditingAvatar(false)
    setSaving(true)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: url || null,
        background_url: backgroundUrl || null,
        integration_visibility: integrationVisibility,
        profile_card_sections: profileSections,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
      refreshUser()
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">Customize your public profile.</p>
      </div>

      {/* Cover + Profile — cover fills the whole card */}
      <div
        className="relative rounded-3xl shadow-[var(--dk-shadow-md)]"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }}
      >
        {/* Gradient atmosphere over the full card */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-black/30 via-black/10 via-40% to-black/70 pointer-events-none" />

        {/* Cover area — clickable to change */}
        <div className="relative h-40 group">
          {editingCover && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingCover(false)}>
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
                <AssetEditor
                  label="Cover Image"
                  value={backgroundUrl}
                  onSubmit={(url) => applyCoverEditor(url, false)}
                  onRemove={() => applyCoverEditor('', true)}
                  onCancel={() => setEditingCover(false)}
                  cropConfig={{ shape: 'rect', aspect: 16 / 9, outputSize: { width: 1200, height: 675 } }}
                />
              </div>
            </div>,
            document.body,
          )}
          <button
            onClick={() => setEditingCover(true)}
            className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-black/70 hover:text-white transition-all"
          >
            <Pencil className="h-3 w-3" />
            Change Cover
          </button>
        </div>

        {/* Avatar + name + bio — glass overlay */}
        <div className="relative bg-gradient-to-b from-transparent via-black/30 to-black/60 px-6 pb-6 pt-4 rounded-b-3xl">
          <div className="flex items-end gap-4 -mt-16">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="rounded-full ring-4 ring-white/10">
                <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
              </div>
              {editingAvatar && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingAvatar(false)}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <AssetEditor
                      compact
                      label="Avatar Image"
                      value={avatarUrl}
                      onSubmit={(url) => applyAvatarEditor(url, false)}
                      onRemove={() => applyAvatarEditor('', true)}
                      onCancel={() => setEditingAvatar(false)}
                      cropConfig={{ shape: 'round', aspect: 1, outputSize: { width: 400, height: 400 } }}
                    />
                  </div>
                </div>,
                document.body,
              )}
              {!editingAvatar && (
                <button
                  onClick={() => setEditingAvatar(true)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-4 w-4 text-white" />
                </button>
              )}
            </div>

            <div className="pb-1 min-w-0 flex-1 relative z-10">
              <h3 className="text-lg font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                {user.username}
                {user.isAdmin && (
                  <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80" />
                )}
              </h3>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-5">
            <div className="relative">
              <textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= BIO_MAX_LENGTH) setBio(e.target.value)
                }}
                placeholder="Write a short bio..."
                rows={4}
                className="w-full resize-none rounded-2xl bg-white/[0.06] backdrop-blur-sm px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors focus:outline-none focus:bg-white/[0.10]"
              />
              <span
                className={cn(
                  'absolute bottom-3 right-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums bg-black/40 backdrop-blur-sm',
                  bio.length > BIO_MAX_LENGTH * 0.85
                    ? 'text-primary'
                    : 'text-white/50',
                )}
              >
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              Keep it short. This appears on your public profile.
            </p>
          </div>
        </div>
      </div>

      {/* Integration visibility — separate section outside the profile card */}
      {(user.steamId || user.plexId || user.tmdbUsername) && (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
          <SectionHeader
            title="Integrations visibility"
            description="Choose which connected accounts appear on your public profile."
          />
          <div className="space-y-4 mt-4">
            {user.steamId && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Steam</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={steamVisibility}
                  onChange={setSteamVisibility}
                />
              </div>
            )}
            {user.plexId && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Plex</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={plexVisibility}
                  onChange={setPlexVisibility}
                />
              </div>
            )}
            {user.tmdbUsername && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">TMDb</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={tmdbVisibility}
                  onChange={setTmdbVisibility}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile sections */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
        <SectionHeader
          title="Profile sections"
          description="Drag to reorder. Toggle to show or hide sections on your profile."
        />
        <ReorderableSectionList
          profileSections={profileSections}
          onChange={setProfileSections}
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
          Save Profile
        </DkButton>
        {saved && <span className="text-xs text-green-500 animate-in fade-in">Saved</span>}
      </div>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  )
}

type SectionOption = (typeof PROFILE_SECTION_OPTIONS)[number]

function ReorderableSectionList({
  profileSections,
  onChange,
}: {
  profileSections: string[]
  onChange: React.Dispatch<React.SetStateAction<string[]>>
}) {
  const dragIndex = useRef<number | null>(null)

  const displayOrder: (SectionOption & { enabled: boolean })[] = [
    ...profileSections
      .map((id) => PROFILE_SECTION_OPTIONS.find((o) => o.id === id))
      .filter((o): o is SectionOption => o != null)
      .map((o) => ({ ...o, enabled: true })),
    ...PROFILE_SECTION_OPTIONS.filter((o) => !profileSections.includes(o.id)).map((o) => ({
      ...o,
      enabled: false,
    })),
  ]

  return (
    <div className="space-y-1.5 mt-4">
      {displayOrder.map((option, index) => {
        const isFirstDisabled = !option.enabled && displayOrder[index - 1]?.enabled

        return (
          <div key={option.id}>
            {isFirstDisabled && (
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="flex-1 h-px bg-border/30" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  Hidden
                </span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
            )}
            <div
              draggable={option.enabled}
              onDragStart={(e) => {
                if (!option.enabled) {
                  e.preventDefault()
                  return
                }
                e.dataTransfer.effectAllowed = 'move'
                dragIndex.current = index
                ;(e.currentTarget as HTMLElement).style.opacity = '0.4'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragIndex.current
                dragIndex.current = null
                if (from == null || from === index) return

                const fromItem = displayOrder[from]
                const toItem = option
                if (!fromItem.enabled || !toItem.enabled) return

                onChange((prev) => {
                  const next = [...prev]
                  const fromPos = next.indexOf(fromItem.id)
                  const toPos = next.indexOf(toItem.id)
                  if (fromPos === -1 || toPos === -1) return prev
                  const [moved] = next.splice(fromPos, 1)
                  next.splice(toPos, 0, moved)
                  return next
                })
              }}
              onDragEnd={(e) => {
                ;(e.currentTarget as HTMLElement).style.opacity = '1'
                dragIndex.current = null
              }}
              className={cn(
                'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors group',
                option.enabled
                  ? 'hover:bg-[var(--dk-surface-glass)]'
                  : 'opacity-40',
              )}
            >
              <div
                className={cn(
                  option.enabled ? 'cursor-grab active:cursor-grabbing' : '',
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground truncate">{option.description}</p>
              </div>

              <DkSwitch
                checked={option.enabled}
                onCheckedChange={(checked) => {
                  onChange((prev) =>
                    checked ? [...prev, option.id] : prev.filter((id) => id !== option.id),
                  )
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AssetEditor({
  compact = false,
  label,
  onCancel,
  onSubmit,
  onRemove,
  value,
  cropConfig,
}: {
  compact?: boolean
  label: string
  onCancel: () => void
  onSubmit: (url: string) => void
  onRemove?: () => void
  value: string
  cropConfig?: { shape: 'round' | 'rect'; aspect: number; outputSize: { width: number; height: number } }
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState(value)
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
    }
  }, [previewObjectUrl, cropImageUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    if (cropConfig) {
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
      setCropImageUrl(objectUrl)
    } else {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
      setSelectedFile(file)
      setPreviewObjectUrl(objectUrl)
    }
  }

  const handleCropComplete = (blob: Blob) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    const croppedFile = new File([blob], 'cropped.webp', { type: 'image/webp' })
    setSelectedFile(croppedFile)
    setPreviewObjectUrl(URL.createObjectURL(blob))
    setCropImageUrl(null)
  }

  const handleCropCancel = () => {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
    setCropImageUrl(null)
    fileInputRef.current && (fileInputRef.current.value = '')
  }

  const handleApply = async () => {
    if (mode === 'file' && selectedFile) {
      setUploading(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)
        const { data } = await apiClient.post('/upload', formData)
        onSubmit(data.url)
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          (err as { message?: string })?.message ??
          'Upload failed. Try a different file or paste a URL.'
        setError(msg)
      } finally {
        setUploading(false)
      }
    } else if (mode === 'url') {
      onSubmit(urlDraft.trim())
    }
  }

  const showPreview = mode === 'file' && previewObjectUrl
  const showCurrentUrl = mode === 'file' && value && !previewObjectUrl

  return (
    <>
      {cropImageUrl && cropConfig && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleCropCancel}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CropModal
              imageUrl={cropImageUrl}
              shape={cropConfig.shape}
              aspect={cropConfig.aspect}
              outputSize={cropConfig.outputSize}
              onComplete={handleCropComplete}
              onCancel={handleCropCancel}
            />
          </div>
        </div>,
        document.body,
      )}
      <div
      className={cn(
        'rounded-2xl border border-white/[0.12] bg-black/80 p-5 text-white shadow-2xl backdrop-blur-2xl ring-1 ring-white/[0.06] animate-in fade-in zoom-in-95 origin-top duration-150',
        compact ? 'w-80' : 'w-full',
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06]">
          {mode === 'file' ? <Upload className="h-4 w-4 text-white/60" /> : <Link2 className="h-4 w-4 text-white/60" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white tracking-[-0.01em]">{label}</p>
          <p className="text-[12px] text-white/45 mt-0.5">
            {mode === 'file' ? 'Pick an image file to upload.' : 'Paste an image URL.'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      {mode === 'file' ? (
        <div className="space-y-3">
          {showPreview || showCurrentUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
              <img
                src={showPreview ? previewObjectUrl! : value}
                alt="Preview"
                className="h-36 w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <button
                onClick={() => {
                  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
                  setSelectedFile(null)
                  setPreviewObjectUrl(null)
                  fileInputRef.current && (fileInputRef.current.value = '')
                }}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/60 hover:bg-black/80 hover:text-white transition-all backdrop-blur-sm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {selectedFile && (
                <p className="absolute left-3 bottom-3 text-[11px] text-white/60 font-medium">
                  {selectedFile.name}
                </p>
              )}
            </div>
          ) : (
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] transition-all hover:border-primary/30 hover:bg-white/[0.04]',
                compact ? 'h-24 gap-1.5' : 'h-32 gap-2',
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
                <Image className={cn('text-white/25', compact ? 'h-5 w-5' : 'h-6 w-6')} />
              </div>
              <span className="text-[12px] text-white/40 font-medium">Click to select image</span>
              <span className="text-[11px] text-white/20">PNG, JPEG, WebP, GIF — max 5MB</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
              setSelectedFile(null)
              setPreviewObjectUrl(null)
              setMode('url')
              setUrlDraft(value)
            }}
            className="text-[12px] text-white/35 hover:text-white/60 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/40"
          >
            or paste a URL instead
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className={cn(
              'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-all',
              compact ? 'h-10' : 'h-11',
              'placeholder:text-white/25 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/30',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply()
              if (e.key === 'Escape') onCancel()
            }}
            spellCheck={false}
            autoFocus
          />

          <button
            type="button"
            onClick={() => setMode('file')}
            className="text-[12px] text-white/35 hover:text-white/60 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/40"
          >
            or upload a file instead
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-4 text-[12px] text-red-400/90 bg-red-400/5 rounded-lg px-3 py-2 border border-red-400/10">
          {error}
        </p>
      )}

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/25">
          {mode === 'file' ? 'Pick a file and apply.' : 'Enter applies. Escape cancels.'}
        </p>
        <div className="flex items-center gap-2">
          {value && (
            <DkButton
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRemove?.() ?? onSubmit('')}
              className="text-red-400/70 hover:text-red-400 border-red-400/10 hover:border-red-400/30"
            >
              Remove
            </DkButton>
          )}
          <DkButton
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="text-white/60 hover:text-white"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleApply}
            loading={uploading}
            disabled={mode === 'file' ? !selectedFile : !urlDraft.trim()}
          >
            {uploading ? 'Uploading...' : 'Apply'}
          </DkButton>
        </div>
      </div>
    </div>
    </>
  )
}

// ── Appearance ──

const ACCENTS = [
  { id: 'orange', primary: 'oklch(0.705 0.213 47.604)' },
  { id: 'amber', primary: 'oklch(0.769 0.188 70.08)' },
  { id: 'yellow', primary: 'oklch(0.828 0.189 84.429)' },
  { id: 'lime', primary: 'oklch(0.768 0.233 130.85)' },
  { id: 'green', primary: 'oklch(0.627 0.194 149.214)' },
  { id: 'emerald', primary: 'oklch(0.596 0.145 163.225)' },
  { id: 'teal', primary: 'oklch(0.696 0.17 162.48)' },
  { id: 'cyan', primary: 'oklch(0.715 0.143 215.221)' },
  { id: 'sky', primary: 'oklch(0.685 0.169 237.323)' },
  { id: 'blue', primary: 'oklch(0.623 0.214 259.815)' },
  { id: 'indigo', primary: 'oklch(0.585 0.233 277.117)' },
  { id: 'violet', primary: 'oklch(0.606 0.25 292.717)' },
  { id: 'purple', primary: 'oklch(0.624 0.21 306.551)' },
  { id: 'fuchsia', primary: 'oklch(0.592 0.233 328.363)' },
  { id: 'pink', primary: 'oklch(0.592 0.212 350.487)' },
  { id: 'rose', primary: 'oklch(0.577 0.245 27.325)' },
] as const

const ACCENT_STORAGE_KEY = 'otix-accent'
const CUSTOM_ACCENTS_KEY = 'otix-accent-customs'

function getCustomAccents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_ACCENTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return ACCENTS[0].primary
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
  if (stored && typeof stored === 'string') return stored
  return ACCENTS[0].primary
}

function applyAccentColor(color: string) {
  const root = document.documentElement
  root.style.setProperty('--primary', color)
  root.style.setProperty('--ring', color)
  root.style.setProperty('--sidebar-primary', color)
  root.style.setProperty('--sidebar-ring', color)
  localStorage.setItem(ACCENT_STORAGE_KEY, color)
}

function AppearanceSection({ theme, onSetTheme }: { theme: ThemeSetting; onSetTheme: (t: ThemeSetting) => void }) {
  const { shaderQuality, setShaderQuality } = useShaderQuality()
  const { motionPreference, setMotionPreference } = useMotionPreference()
  const [accent, setAccent] = useState<string>(getInitialAccent)
  const [customAccents, setCustomAccents] = useState<string[]>(getCustomAccents)
  useEffect(() => {
    applyAccentColor(accent)
  }, [accent])

  const setCustomSlot = (index: number, color: string) => {
    const next = [...customAccents]
    next[index] = color
    for (let i = 0; i < next.length; i++) {
      if (!next[i]) next[i] = ''
    }
    setCustomAccents(next)
    localStorage.setItem(CUSTOM_ACCENTS_KEY, JSON.stringify(next))
    setAccent(color)
  }

  const isActive = (color: string) => accent === color

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'} mode
              </p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark' ? 'Easier on the eyes at night' : theme === 'light' ? 'Bright and crisp for daytime' : 'Follows your device settings'}
              </p>
            </div>
          </div>
          <div className="flex rounded-lg bg-[var(--dk-surface-base)] p-1 gap-0.5">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSetTheme(t)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  theme === t
                    ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-xs)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Accent" description="Pick a color accent for the interface." />

        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.primary)}
              className="relative h-7 w-7 rounded-full transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: a.primary }}
            >
              {isActive(a.primary) && (
                <span className="absolute inset-0 rounded-full ring-2 ring-foreground/20 ring-offset-2 ring-offset-[var(--dk-surface-base)]" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 pt-4 border-t border-border/30">
          {Array.from({ length: 16 }).map((_, i) => {
            const color = customAccents[i] || ''
            const hasColor = color.length > 0
            const active = hasColor && isActive(color)
            return (
              <label
                key={i}
                className={cn(
                  'relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95',
                  hasColor ? '' : 'bg-[var(--dk-surface-raised)]',
                )}
                style={hasColor ? { backgroundColor: color } : undefined}
                onClick={(e) => {
                  if (hasColor && !active) {
                    e.preventDefault()
                    setAccent(color)
                  }
                }}
              >
                {!hasColor && <Plus className="h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />}
                {active && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-foreground/20 ring-offset-2 ring-offset-[var(--dk-surface-base)] pointer-events-none" />
                )}
                <input
                  type="color"
                  value={color || '#000000'}
                  onChange={(e) => setCustomSlot(i, e.target.value)}
                  className="absolute -left-1.5 top-0 bottom-0 right-0 opacity-0"
                />
              </label>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Motion"
          description="Control animations and transitions across the app."
        />

        <div className="rounded-xl bg-[var(--dk-surface-raised)] p-2 shadow-[var(--dk-shadow-xs)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MOTION_OPTIONS.map((option) => {
              const isActive = motionPreference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMotionPreference(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'bg-[var(--dk-surface-overlay)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
                  )}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Home Background Quality"
          description="Control the animated shader quality on the homepage, or let Otix choose automatically."
        />

        <div className="rounded-xl bg-[var(--dk-surface-raised)] p-2 shadow-[var(--dk-shadow-xs)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {SHADER_QUALITY_OPTIONS.map((option) => {
              const isActive = shaderQuality === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShaderQuality(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'bg-[var(--dk-surface-overlay)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
                  )}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Account ──

function TwoFactorCard({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [mode, setMode] = useState<'idle' | 'setup' | 'enabling' | 'disabling'>('idle')
  const [setupData, setSetupData] = useState<{ secret: string; provisioningUri: string; qrCodeSvg: string } | null>(null)
  const [code, setCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [error, setError] = useState('')

  const handleSetup = async () => {
    setError('')
    setCode('')
    try {
      const { data } = await apiClient.post('/auth/2fa/setup')
      setSetupData({ secret: data.secret, provisioningUri: data.provisioningUri, qrCodeSvg: data.qrCodeSvg })
      setMode('setup')
    } catch (err) {
      setError(extractMessage(err))
    }
  }

  const handleEnable = async () => {
    if (code.length !== 6) return
    setError('')
    setMode('enabling')
    try {
      await apiClient.post('/auth/2fa/enable', { code })
      setMode('idle')
      setSetupData(null)
      setCode('')
      // Reload to reflect the new twoFactorEnabled state
      window.location.reload()
    } catch (err) {
      setMode('setup')
      setError(extractMessage(err))
    }
  }

  const handleDisable = async () => {
    if (!disablePassword) return
    setError('')
    setMode('disabling')
    try {
      await apiClient.post('/auth/2fa/disable', { password: disablePassword })
      setMode('idle')
      setDisablePassword('')
      window.location.reload()
    } catch (err) {
      setMode('idle')
      setError(extractMessage(err))
    }
  }

  const handleCancel = () => {
    setMode('idle')
    setSetupData(null)
    setCode('')
    setDisablePassword('')
    setError('')
  }

  function extractMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const resp = (err as { response?: { data?: { detail?: string } } }).response
      if (resp?.data?.detail) return resp.data.detail
    }
    if (err instanceof Error) return err.message
    return 'Something went wrong. Please try again.'
  }

  if (twoFactorEnabled) {
    return (
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Two-Factor Authentication"
          description="Your account is protected with an authenticator app."
        />

        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">
                You'll need a code from your authenticator app to sign in.
              </p>
            </div>
          </div>

          {mode === 'disabling' ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="h-9 w-40 rounded-lg bg-[var(--dk-surface-ghost-hover)] px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDisable()
                  if (e.key === 'Escape') handleCancel()
                }}
              />
              <DkButton size="sm" variant="outline" onClick={handleCancel}>
                Cancel
              </DkButton>
              <DkButton size="sm" variant="primary" onClick={handleDisable} disabled={!disablePassword}>
                Disable
              </DkButton>
            </div>
          ) : (
            <DkButton
              size="sm"
              variant="outline"
              onClick={() => setMode('disabling')}
            >
              Disable 2FA
            </DkButton>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Two-Factor Authentication"
        description="Add an extra layer of security to your account."
      />

      {(mode === 'setup' || mode === 'enabling') && setupData ? (
        <div className="space-y-5">
          <div className="flex justify-center p-4 bg-white rounded-xl">
            <img src={setupData.qrCodeSvg} alt="2FA QR Code" className="h-48 w-48" />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Scan this QR code with your authenticator app, or enter the secret manually:
            </p>
            <code className="block break-all rounded-lg bg-[var(--dk-surface-raised)] px-3 py-2 text-xs font-mono select-all">
              {setupData.secret}
            </code>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="flex h-11 w-full rounded-xl bg-[var(--dk-surface-ghost-hover)] px-4 text-center font-mono tracking-[0.3em] placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <DkButton variant="outline" onClick={handleCancel}>
              Cancel
            </DkButton>
            <DkButton
              variant="primary"
              onClick={handleEnable}
              loading={mode === 'enabling'}
              disabled={code.length !== 6}
            >
              Verify &amp; Enable
            </DkButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Not enabled</p>
              <p className="text-xs text-muted-foreground">
                Protect your account with an authenticator app like Google Authenticator or 1Password.
              </p>
            </div>
          </div>
          <DkButton size="sm" variant="primary" onClick={handleSetup}>
            Enable 2FA
          </DkButton>
        </div>
      )}
    </div>
  )
}

function VerificationCard({
  isVerified,
  state,
  onSend,
}: {
  isVerified: boolean
  state: 'idle' | 'sending' | 'sent'
  onSend: () => void
}) {
  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Email Verification"
        description={
          isVerified
            ? 'Your email address has been verified.'
            : 'Verify your email to unlock all features.'
        }
      />

      <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isVerified ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500',
            )}
          >
            {isVerified ? <Check className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isVerified ? 'Verified' : 'Not verified'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isVerified
                ? 'You have full access to all features.'
                : 'Some features may be limited until you verify.'}
            </p>
          </div>
        </div>

        {!isVerified && (
          <DkButton
            variant="outline"
            size="sm"
            onClick={onSend}
            loading={state === 'sending'}
            disabled={state === 'sent'}
          >
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {state === 'sent' ? 'Sent!' : 'Send Verification Email'}
          </DkButton>
        )}
      </div>

      {state === 'sent' && (
        <p className="mt-3 text-xs text-green-500 animate-in fade-in">
          Verification email sent. Check your inbox and follow the link to verify your account.
        </p>
      )}
    </div>
  )
}

function SessionsCard() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revokingKey, setRevokingKey] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [error, setError] = useState('')

  const loadSessions = async () => {
    try {
      const data = await fetchSessions()
      setSessions(data.sessions)
      setCurrentKey(data.currentSessionKey)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleRevoke = async (sessionKey: string) => {
    setRevokingKey(sessionKey)
    setError('')
    try {
      await revokeSession(sessionKey)
      setSessions((prev) => prev.filter((s) => s.sessionKey !== sessionKey))
    } catch {
      setError('Failed to revoke session.')
    } finally {
      setRevokingKey(null)
    }
  }

  const handleRevokeAllOthers = async () => {
    setRevokingAll(true)
    setError('')
    try {
      const count = await revokeOtherSessions()
      if (count > 0) {
        setSessions((prev) => prev.filter((s) => s.sessionKey === currentKey))
      }
    } catch {
      setError('Failed to revoke other sessions.')
    } finally {
      setRevokingAll(false)
    }
  }

  const formatUA = (ua: string | null): string => {
    if (!ua) return 'Unknown device'
    // Try to extract browser name
    const browsers = ['Firefox', 'Chrome', 'Safari', 'Edge', 'Opera']
    for (const b of browsers) {
      if (ua.includes(b)) {
        const match = ua.match(new RegExp(`${b}\\/([\\d.]+)`))
        return match ? `${b} ${match[1]}` : b
      }
    }
    return ua.length > 50 ? ua.slice(0, 50) + '…' : ua
  }

  const formatTime = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHrs = Math.floor(diffMin / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  const otherSessions = sessions.filter((s) => s.sessionKey !== currentKey)

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Active Sessions"
        description="Devices where your account is currently signed in."
      />

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sessions...
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const isCurrent = session.sessionKey === currentKey
            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'flex items-center justify-between rounded-xl px-4 py-3',
                  isCurrent
                    ? 'bg-primary/5 border border-primary/15'
                    : 'bg-[var(--dk-surface-raised)]',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      isCurrent ? 'bg-primary/10 text-primary' : 'bg-[var(--dk-surface-overlay)] text-muted-foreground',
                    )}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {formatUA(session.userAgent)}
                      </p>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress ?? 'Unknown IP'}
                      {session.lastSeenAt && (
                        <> &middot; {formatTime(session.lastSeenAt)}</>
                      )}
                    </p>
                  </div>
                </div>

                {!isCurrent && (
                  <DkButton
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(session.sessionKey)}
                    loading={revokingKey === session.sessionKey}
                  >
                    Revoke
                  </DkButton>
                )}
              </div>
            )
          })}

          {sessions.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No active sessions found.</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {otherSessions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/30">
          <DkButton
            variant="outline"
            size="sm"
            onClick={handleRevokeAllOthers}
            loading={revokingAll}
          >
            Revoke All Other Sessions
          </DkButton>
        </div>
      )}
    </div>
  )
}

type SteamProfile = {
  personaname: string | null
  avatarfull: string | null
  profileurl: string | null
  realname: string | null
  loccountrycode: string | null
  timecreated: number | null
  personastate: number | null
  lastlogoff: number | null
}

type PlexIntegration = {
  name: string
  connected: boolean
  plexId: string | null
  plexUsername: string | null
  plexEmail: string | null
  plexThumb: string | null
}

type PlexSyncResult = {
  servers: number
  libraries: number
  total: number
  matched: number
  seeded: number
}

type PlexSyncEvent =
  | { type: 'server_found'; serverName: string }
  | { type: 'library_found'; serverName: string; libraryName: string; libraryType: string }
  | { type: 'syncing_library'; serverName: string; libraryName: string; itemsTotal: number }
  | { type: 'library_progress'; serverName: string; libraryName: string; itemsProcessed: number; itemsTotal: number }
  | { type: 'library_complete'; serverName: string; libraryName: string; total: number; matched: number; seeded: number }
  | { type: 'sync_complete'; servers: number; libraries: number; total: number; matched: number; seeded: number }
  | { type: 'error'; message: string }

type PlexProgressState = {
  phase: string
  libraryName?: string
  itemsProcessed?: number
  itemsTotal?: number
}

type SpotifySyncEvent =
  | { type: 'sync_started' }
  | { type: 'fetching_tracks' }
  | { type: 'tracks_fetched'; count: number }
  | { type: 'matching_tracks'; count: number }
  | { type: 'tracks_matched'; matched: number; total: number }
  | { type: 'seeding_albums'; count: number }
  | { type: 'albums_seeded'; count: number }
  | { type: 'sync_complete'; liked_total: number; liked_matched: number; liked_seeded: number }
  | { type: 'error'; message: string }

type SpotifyProgressState = {
  phase: string
  detail?: string
}

type YouTubeSyncEvent =
  | { type: 'sync_started' }
  | { type: 'fetching_history' }
  | { type: 'history_fetched'; count: number }
  | { type: 'fetching_liked_videos' }
  | { type: 'liked_videos_fetched'; count: number }
  | { type: 'videos_analyzed'; total: number; music_videos: number }
  | { type: 'matching_complete'; matched: number; total_music: number }
  | { type: 'sync_complete'; total: number; music_videos: number; matched: number; channel_links: number }
  | { type: 'error'; message: string }

type YouTubeProgressState = {
  phase: string
  detail?: string
}

async function* parseYouTubeSseEvents(response: Response): AsyncGenerator<YouTubeSyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield JSON.parse(line.slice(6)) as YouTubeSyncEvent
        }
      }
    }
  }
}

async function* parseSpotifySseEvents(response: Response): AsyncGenerator<SpotifySyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield JSON.parse(line.slice(6)) as SpotifySyncEvent
        }
      }
    }
  }
}

async function* parseSseEvents(response: Response): AsyncGenerator<PlexSyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          const parsed = JSON.parse(line.slice(6))
          // Convert snake_case to camelCase client-side since SSE bypasses axios interceptor
          if (parsed.server_name) {
            parsed.serverName = parsed.server_name
            delete parsed.server_name
          }
          if (parsed.library_name) {
            parsed.libraryName = parsed.library_name
            delete parsed.library_name
          }
          if (parsed.library_type) {
            parsed.libraryType = parsed.library_type
            delete parsed.library_type
          }
          if (parsed.items_total !== undefined) {
            parsed.itemsTotal = parsed.items_total
            delete parsed.items_total
          }
          if (parsed.items_processed !== undefined) {
            parsed.itemsProcessed = parsed.items_processed
            delete parsed.items_processed
          }
          yield parsed as PlexSyncEvent
        }
      }
    }
  }
}

function formatAccountAge(unixTimestamp: number | null): string {
  if (!unixTimestamp) return ''
  const created = new Date(unixTimestamp * 1000)
  const now = new Date()
  const years = now.getFullYear() - created.getFullYear()
  const monthDiff = now.getMonth() - created.getMonth()
  const adjustedYears = monthDiff < 0 ? years - 1 : years
  if (adjustedYears < 1) return 'Joined this year'
  if (adjustedYears === 1) return '1 year on Steam'
  return `${adjustedYears} years on Steam`
}

const PERSONA_STATES: Record<number, string> = {
  0: 'Offline',
  1: 'Online',
  2: 'Busy',
  3: 'Away',
  4: 'Snooze',
  5: 'Looking to trade',
  6: 'Looking to play',
}

function personaStateLabel(state: number | null): string {
  if (state === null || state === undefined) return 'Unknown'
  return PERSONA_STATES[state] ?? 'Unknown'
}

function extractIntegrationMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  plex: '#e5a00d',
  spotify: '#1db954',
  tmdb: '#01b4e4',
  google: '#4285F4',
}

const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  plex: 'bg-[#e5a00d]/10',
  spotify: 'bg-[#1db954]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
}

// ── Integration card (iOS-style expandable) ──

function IntegrationCard({
  name,
  description,
  brandColor,
  brandBg,
  icon: Icon,
  isConnected,
  expanded,
  onToggle,
  onConnect,
  connecting,
  onDisconnect,
  disconnecting,
  children,
}: {
  name: string
  description: string
  brandColor: string
  brandBg: string
  icon: React.ComponentType<{ className?: string }>
  isConnected: boolean
  expanded: boolean
  onToggle: () => void
  onConnect?: () => void
  connecting?: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={isConnected ? onToggle : undefined}
        className={cn(
          'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors',
          isConnected && 'hover:bg-[var(--dk-surface-glass)] active:bg-[var(--dk-surface-glass)]',
        )}
        style={{ borderLeft: `3px solid ${brandColor}` }}
      >
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', brandBg)} style={{ color: brandColor }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{name}</p>
            {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        </div>
        {isConnected ? (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        ) : (
          <DkButton size="sm" variant="primary" onClick={onConnect} loading={connecting} className="shrink-0 shadow-none">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </DkButton>
        )}
      </button>

      {/* Expanded content */}
      {isConnected && expanded && (
        <div className="border-t border-border/20">
          {children}
          {onDisconnect && (
            <div className="border-t border-border/20 px-5 py-3">
              <DkButton
                size="sm"
                variant="ghost"
                onClick={onDisconnect}
                loading={disconnecting}
                className="w-full bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15"
              >
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Disconnect {name}
              </DkButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Integration profile row ──

function IntegrationProfile({
  avatarUrl,
  avatarAlt,
  name,
  detail,
  brandColor,
  brandBg,
  icon: Icon,
  meta,
}: {
  avatarUrl?: string | null
  avatarAlt: string
  name: string
  detail: string
  brandColor?: string
  brandBg?: string
  icon?: React.ComponentType<{ className?: string }>
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      {avatarUrl ? (
        <img src={avatarUrl} alt={avatarAlt} className="h-10 w-10 rounded-xl object-cover ring-1 ring-border/20" />
      ) : (
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', brandBg || 'bg-muted/20')} style={brandColor ? { color: brandColor } : undefined}>
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      {meta}
    </div>
  )
}

// ── Integration action row ──

function IntegrationAction({
  label,
  description,
  result,
  buttonLabel,
  buttonIcon: ButtonIcon,
  onPress,
  loading,
  disabled,
  progress,
  children,
  muted,
}: {
  label: string
  description: string
  result?: string | null
  buttonLabel: string
  buttonIcon?: React.ComponentType<{ className?: string }>
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  progress?: React.ReactNode
  children?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4', muted && 'bg-[var(--dk-surface-overlay)]/30')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">{label}</p>
          {progress}
        </div>
        <p className="mt-1 text-sm font-medium">{description}</p>
        {result && <p className="text-xs text-muted-foreground mt-0.5">{result}</p>}
        {children}
      </div>
      <DkButton
        size="sm"
        variant="ghost"
        onClick={onPress}
        loading={loading}
        disabled={disabled}
        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
      >
        {ButtonIcon && <ButtonIcon className="h-3.5 w-3.5 mr-1.5" />}
        {buttonLabel}
      </DkButton>
    </div>
  )
}

// ── Integration stats row ──

function IntegrationStats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-xs text-muted-foreground border-t border-border/20">
      {items.map((item) => (
        <span key={item.label}>
          <strong className="text-foreground">{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  )
}

function IntegrationsSection() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ totalInSteam: number; matchedInOtix: number } | null>(null)
  const [wishlistScanning, setWishlistScanning] = useState(false)
  const [wishlistScanResult, setWishlistScanResult] = useState<{ total: number; matched: number; private?: boolean } | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveResult, setResolveResult] = useState<{ resolved: number; synced: number; failed: number; total: number } | null>(null)
  const [plexConnecting, setPlexConnecting] = useState(false)
  const [plexDisconnecting, setPlexDisconnecting] = useState(false)
  const [plexSyncing, setPlexSyncing] = useState(false)
  const [plexSyncResult, setPlexSyncResult] = useState<PlexSyncResult | null>(null)
  const [plexProgress, setPlexProgress] = useState<PlexProgressState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [steamMessage, setSteamMessage] = useState('')
  const [steamError, setSteamError] = useState('')
  const [plexMessage, setPlexMessage] = useState('')
  const [plexError, setPlexError] = useState('')
  const [plexWatchlistSyncing, setPlexWatchlistSyncing] = useState(false)
  const [plexWatchlistSyncResult, setPlexWatchlistSyncResult] = useState<{ total: number; matched: number; seeded: number } | null>(null)
  const [steamConnected, setSteamConnected] = useState(Boolean(user?.steamId))
  const [steamId, setSteamId] = useState<string | null>(user?.steamId ?? null)
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null)
  const [plexConnected, setPlexConnected] = useState(Boolean(user?.plexId))
  const [plex, setPlex] = useState<PlexIntegration | null>(null)
  const [tmdbConnected, setTmdbConnected] = useState(Boolean(user?.tmdbUsername))
  const [tmdbUsername, setTmdbUsername] = useState<string | null>(user?.tmdbUsername ?? null)
  const [tmdbAvatarUrl, setTmdbAvatarUrl] = useState<string | null>(user?.tmdbAvatarUrl ?? null)
  const [tmdbStats, setTmdbStats] = useState<Record<string, number> | null>(null)
  const [tmdbSyncDirection, setTmdbSyncDirection] = useState(user?.tmdbRatingSyncDirection ?? 'disabled')
  const [tmdbSyncing, setTmdbSyncing] = useState(false)
  const [tmdbWatchlistImporting, setTmdbWatchlistImporting] = useState(false)
  const [tmdbSyncResult, setTmdbSyncResult] = useState<{ imported: number; exported: number; skipped: number } | null>(null)
  const [tmdbWatchlistResult, setTmdbWatchlistResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [tmdbConnecting, setTmdbConnecting] = useState(false)
  const [tmdbDisconnecting, setTmdbDisconnecting] = useState(false)
  const [tmdbMessage, setTmdbMessage] = useState('')
  const [tmdbError, setTmdbError] = useState('')
  const [spotifyConnected, setSpotifyConnected] = useState(Boolean(user?.spotifyId))
  const [spotifyUsername, setSpotifyUsername] = useState<string | null>(user?.spotifyUsername ?? null)
  const [spotifyAvatarUrl, setSpotifyAvatarUrl] = useState<string | null>(user?.spotifyAvatarUrl ?? null)
  const [spotifyStats, setSpotifyStats] = useState<Record<string, unknown> | null>(null)
  const [spotifyConnecting, setSpotifyConnecting] = useState(false)
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false)
  const [spotifyMessage, setSpotifyMessage] = useState('')
  const [spotifyError, setSpotifyError] = useState('')
  const [spotifySyncing, setSpotifySyncing] = useState(false)
  const [spotifySyncResult, setSpotifySyncResult] = useState<{ likedTotal: number; likedMatched: number; likedSeeded: number } | null>(null)
  const [spotifyProgress, setSpotifyProgress] = useState<SpotifyProgressState | null>(null)
  const isSpotifyConnected = spotifyConnected
  const [googleConnected, setGoogleConnected] = useState(Boolean(user?.googleId))
  const [googleName, setGoogleName] = useState<string | null>(user?.googleName ?? null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(user?.googleEmail ?? null)
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(user?.googleAvatarUrl ?? null)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [youtubeSyncing, setYoutubeSyncing] = useState(false)
  const [youtubeSyncResult, setYoutubeSyncResult] = useState<{ total: number; music_videos: number; matched: number; channel_links: number } | null>(null)
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeMessage, setYoutubeMessage] = useState('')
  const isGoogleConnected = googleConnected
  const isSteamConnected = steamConnected
  const displayedSteamId = steamId ?? user?.steamId ?? null
  const isPlexConnected = plexConnected
  const isTmdbConnected = tmdbConnected
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const fetchIntegrations = async () => {
    try {
      const { data } = await apiClient.get('/auth/integrations')
      const steam = (data.providers as Array<{
        name: string
        connected: boolean
        steamId: string | null
        steamProfile: SteamProfile | null
      }>).find((p) => p.name === 'steam')
      if (steam) {
        setSteamConnected(steam.connected)
        setSteamId(steam.steamId ?? null)
        setSteamProfile(steam.steamProfile ?? null)
      }
      const plexProvider = (data.providers as PlexIntegration[]).find((p) => p.name === 'plex')
      if (plexProvider) {
        setPlexConnected(plexProvider.connected)
        setPlex(plexProvider)
      }
      const tmdbProvider = (data.providers as Array<{
        name: string
        connected: boolean
        tmdbUsername: string | null
        tmdbAvatarUrl: string | null
        tmdbStats: Record<string, number> | null
        tmdbRatingSyncDirection: string | null
      }>).find((p) => p.name === 'tmdb')
      if (tmdbProvider) {
        setTmdbConnected(tmdbProvider.connected)
        setTmdbUsername(tmdbProvider.tmdbUsername ?? null)
        setTmdbAvatarUrl(tmdbProvider.tmdbAvatarUrl ?? null)
        setTmdbStats(tmdbProvider.tmdbStats ?? null)
        setTmdbSyncDirection(tmdbProvider.tmdbRatingSyncDirection ?? 'disabled')
      }
      const spotifyProvider = (data.providers as Array<{
        name: string
        connected: boolean
        spotifyUsername: string | null
        spotifyAvatarUrl: string | null
        spotifyStats: Record<string, unknown> | null
      }>).find((p) => p.name === 'spotify')
      if (spotifyProvider) {
        setSpotifyConnected(spotifyProvider.connected)
        setSpotifyUsername(spotifyProvider.spotifyUsername ?? null)
        setSpotifyAvatarUrl(spotifyProvider.spotifyAvatarUrl ?? null)
        setSpotifyStats(spotifyProvider.spotifyStats ?? null)
      }
      const googleProvider = (data.providers as Array<{
        name: string
        connected: boolean
        googleName: string | null
        googleEmail: string | null
        googleAvatarUrl: string | null
      }>).find((p) => p.name === 'google')
      if (googleProvider) {
        setGoogleConnected(googleProvider.connected)
        setGoogleName(googleProvider.googleName ?? null)
        setGoogleEmail(googleProvider.googleEmail ?? null)
        setGoogleAvatarUrl(googleProvider.googleAvatarUrl ?? null)
      }
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    queueMicrotask(() => {
      if (isAuthenticated) fetchIntegrations()
      else setLoading(false)
    })
  }, [isAuthenticated, authLoading])

  const handleConnect = async () => {
    setConnecting(true)
    setSteamError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/steam')
      window.location.href = data.authUrl
    } catch (err) {
      setConnecting(false)
      setSteamError(extractIntegrationMessage(err))
    }
  }

  const handlePlexConnect = async () => {
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/plex')
      window.location.href = data.authUrl
    } catch (err) {
      setPlexConnecting(false)
      setPlexError(extractIntegrationMessage(err))
    }
  }

  const handlePlexDisconnect = async () => {
    setPlexDisconnecting(true)
    setPlexError('')
    setPlexMessage('')
    try {
      await apiClient.delete('/auth/integrations/plex')
      setPlexConnected(false)
      setPlex(null)
      setPlexMessage('Plex account unlinked.')
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexDisconnecting(false)
    }
  }

  const handleTmdbConnect = async () => {
    setTmdbConnecting(true)
    setTmdbError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/tmdb')
      window.location.href = data.authUrl
    } catch (err) {
      setTmdbConnecting(false)
      setTmdbError(extractIntegrationMessage(err))
    }
  }

  const handleTmdbDisconnect = async () => {
    setTmdbDisconnecting(true)
    setTmdbError('')
    setTmdbMessage('')
    try {
      await apiClient.delete('/auth/integrations/tmdb')
      setTmdbConnected(false)
      setTmdbUsername(null)
      setTmdbAvatarUrl(null)
      setTmdbStats(null)
      setTmdbSyncDirection('disabled')
      setTmdbMessage('TMDb account unlinked.')
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbDisconnecting(false)
    }
  }

  const handleSpotifyConnect = async () => {
    setSpotifyConnecting(true)
    setSpotifyError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/spotify')
      window.location.href = data.authUrl
    } catch (err) {
      setSpotifyConnecting(false)
      setSpotifyError(extractIntegrationMessage(err))
    }
  }

  const handleSpotifyDisconnect = async () => {
    setSpotifyDisconnecting(true)
    setSpotifyError('')
    setSpotifyMessage('')
    try {
      await apiClient.delete('/auth/integrations/spotify')
      setSpotifyConnected(false)
      setSpotifyUsername(null)
      setSpotifyAvatarUrl(null)
      setSpotifyMessage('Spotify account unlinked.')
    } catch (err) {
      setSpotifyError(extractIntegrationMessage(err))
    } finally {
      setSpotifyDisconnecting(false)
    }
  }

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true)
    setGoogleError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/google')
      window.location.href = data.authUrl
    } catch (err) {
      setGoogleConnecting(false)
      setGoogleError(extractIntegrationMessage(err))
    }
  }

  const handleGoogleDisconnect = async () => {
    setGoogleDisconnecting(true)
    setGoogleError('')
    setGoogleMessage('')
    try {
      await apiClient.delete('/auth/integrations/google')
      setGoogleConnected(false)
      setGoogleName(null)
      setGoogleEmail(null)
      setGoogleAvatarUrl(null)
      setGoogleMessage('Google account unlinked.')
    } catch (err) {
      setGoogleError(extractIntegrationMessage(err))
    } finally {
      setGoogleDisconnecting(false)
    }
  }

  const handleYouTubeSync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setYoutubeSyncing(true)
    setYoutubeError('')
    setYoutubeSyncResult(null)
    setYoutubeMessage('')
    setYoutubeProgress({ phase: 'Starting sync...' })

    try {
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/youtube/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/youtube/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseYouTubeSseEvents(response)) {
        switch (event.type) {
          case 'sync_started':
            setYoutubeProgress({ phase: 'Connected to YouTube...' })
            break
          case 'fetching_liked_videos':
            setYoutubeProgress({ phase: 'Fetching liked videos from YouTube...' })
            break
          case 'liked_videos_fetched':
            setYoutubeProgress({ phase: `Fetched ${event.count} liked videos` })
            break
          case 'videos_analyzed':
            setYoutubeProgress({
              phase: `Found ${event.music_videos} music videos out of ${event.total} total`,
            })
            break
          case 'matching_complete':
            setYoutubeProgress({
              phase: `Matched ${event.matched} of ${event.total_music} music videos`,
            })
            break
          case 'sync_complete':
            setYoutubeSyncResult({
              total: event.total,
              music_videos: event.music_videos,
              matched: event.matched,
              channel_links: event.channel_links,
            })
            setYoutubeMessage(
              `Synced ${event.total} liked videos: ${event.music_videos} music videos, ${event.matched} matched to catalog, ${event.channel_links} channels linked.`,
            )
            setYoutubeProgress(null)
            break
          case 'error':
            setYoutubeError(event.message)
            setYoutubeProgress(null)
            break
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setYoutubeError(extractIntegrationMessage(err))
      setYoutubeProgress(null)
    } finally {
      setYoutubeSyncing(false)
    }
  }

  const handleSpotifySync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setSpotifySyncing(true)
    setSpotifyError('')
    setSpotifySyncResult(null)
    setSpotifyMessage('')
    setSpotifyProgress({ phase: 'Starting sync...' })

    try {
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/spotify/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/spotify/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseSpotifySseEvents(response)) {
        switch (event.type) {
          case 'sync_started':
            setSpotifyProgress({ phase: 'Connected to Spotify...' })
            break
          case 'fetching_tracks':
            setSpotifyProgress({ phase: 'Fetching liked tracks from Spotify...' })
            break
          case 'tracks_fetched':
            setSpotifyProgress({ phase: `Fetched ${event.count} liked tracks` })
            break
          case 'matching_tracks':
            setSpotifyProgress({ phase: `Matching ${event.count} tracks against catalog...` })
            break
          case 'tracks_matched':
            setSpotifyProgress({ phase: `Matched ${event.matched} of ${event.total} tracks`, detail: `${event.matched} interactions created` })
            break
          case 'seeding_albums':
            setSpotifyProgress({ phase: `Seeding ${event.count} missing albums...` })
            break
          case 'albums_seeded':
            setSpotifyProgress({ phase: `Seeded ${event.count} new albums` })
            break
          case 'sync_complete':
            setSpotifySyncResult({ likedTotal: event.liked_total, likedMatched: event.liked_matched, likedSeeded: event.liked_seeded })
            setSpotifyMessage(
              `Synced ${event.liked_total} liked tracks: ${event.liked_matched} matched in catalog, ${event.liked_seeded} new albums seeded.`,
            )
            setSpotifyProgress(null)
            break
          case 'error':
            setSpotifyError(event.message)
            setSpotifyProgress(null)
            break
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSpotifyError(extractIntegrationMessage(err))
      setSpotifyProgress(null)
    } finally {
      setSpotifySyncing(false)
    }
  }

  const tmdbSyncDirections = [
    { value: 'disabled', label: 'Off' },
    { value: 'import', label: 'TMDb → Otix' },
    { value: 'export', label: 'Otix → TMDb' },
    { value: 'bidirectional', label: 'Both ways' },
  ]

  const handleTmdbRatingSync = async () => {
    setTmdbSyncing(true)
    setTmdbError('')
    setTmdbSyncResult(null)
    try {
      const { data } = await apiClient.post('/auth/integrations/tmdb/rating-sync', { direction: tmdbSyncDirection })
      setTmdbSyncResult({ imported: data.imported, exported: data.exported, skipped: data.skipped })
      if (data.errors?.length) setTmdbError(data.errors.join(', '))
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbSyncing(false)
    }
  }

  const handleTmdbWatchlistImport = async () => {
    setTmdbWatchlistImporting(true)
    setTmdbError('')
    setTmdbWatchlistResult(null)
    try {
      const { data } = await apiClient.post('/auth/integrations/tmdb/watchlist-import')
      setTmdbWatchlistResult({ imported: data.imported, skipped: data.skipped })
      if (data.errors?.length) setTmdbError(data.errors.join(', '))
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbWatchlistImporting(false)
    }
  }

  const handlePlexSync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setPlexSyncing(true)
    setPlexError('')
    setPlexSyncResult(null)
    setPlexProgress({ phase: 'Starting sync...' })

    try {
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/plex/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/plex/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseSseEvents(response)) {
        switch (event.type) {
          case 'server_found':
            setPlexProgress({ phase: `Found server: ${event.serverName}` })
            break
          case 'library_found':
            setPlexProgress({ phase: `Found library: ${event.libraryName}` })
            break
          case 'syncing_library':
            setPlexProgress({
              phase: `Syncing ${event.libraryName}...`,
              libraryName: event.libraryName,
              itemsTotal: event.itemsTotal,
              itemsProcessed: 0,
            })
            break
          case 'library_progress':
            setPlexProgress((prev) => prev ? {
              ...prev,
              itemsProcessed: event.itemsProcessed,
              itemsTotal: event.itemsTotal,
            } : null)
            break
          case 'library_complete':
            setPlexProgress({
              phase: `Synced ${event.libraryName}: ${event.total} items (${event.matched} matched, ${event.seeded} seeded)`,
            })
            break
          case 'sync_complete':
            setPlexSyncResult(event)
            setPlexMessage(
              `Synced ${event.total} Plex items from ${event.libraries} libraries on ${event.servers} server(s). Seeded ${event.seeded} new catalog items.`,
            )
            setPlexProgress(null)
            break
          case 'error':
            setPlexError(event.message)
            setPlexProgress(null)
            break
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPlexError(extractIntegrationMessage(err))
      setPlexProgress(null)
    } finally {
      setPlexSyncing(false)
    }
  }

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handlePlexWatchlistSync = async () => {
    setPlexWatchlistSyncing(true)
    setPlexError('')
    setPlexWatchlistSyncResult(null)
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; seeded: number }>(
        '/auth/integrations/plex/watchlist/sync',
      )
      setPlexWatchlistSyncResult(data)
      setPlexMessage(`Found ${data.matched} matches out of ${data.total} watchlist items. Seeded ${data.seeded} items.`)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexWatchlistSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setSteamError('')
    setSteamMessage('')
    try {
      await apiClient.delete('/auth/integrations/steam')
      setSteamConnected(false)
      setSteamId(null)
      setSteamProfile(null)
      setSteamMessage('Steam account unlinked.')
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setSteamError('')
    setScanResult(null)
    try {
      const { data } = await apiClient.post<{ totalInSteam: number; matchedInOtix: number }>(
        '/auth/integrations/steam/scan',
      )
      setScanResult(data)
      setSteamMessage(`Found ${data.matchedInOtix} matches out of ${data.totalInSteam} Steam games.`)
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setScanning(false)
    }
  }

  const handleWishlistScan = async () => {
    setWishlistScanning(true)
    setSteamError('')
    setWishlistScanResult(null)
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; private?: boolean }>(
        '/auth/integrations/steam/wishlist/scan',
      )
      setWishlistScanResult(data)
      if (data.private) {
        setSteamError('Your Steam wishlist is private. Set your Steam privacy settings to Public to import your wishlist.')
      } else {
        setSteamMessage(`Found ${data.matched} wishlist matches out of ${data.total} items.`)
      }
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setWishlistScanning(false)
    }
  }

  const handleResolveUnmatched = async () => {
    setResolving(true)
    setSteamError('')
    setResolveResult(null)
    try {
      const { data } = await apiClient.post<{ resolved: number; synced: number; failed: number; total: number }>(
        '/auth/integrations/steam/resolve-unmatched',
      )
      setResolveResult(data)
      let msg = ''
      if (data.resolved > 0) msg += `${data.resolved} linked, `
      if (data.synced > 0) msg += `${data.synced} synced, `
      if (data.failed > 0) msg += `${data.failed} failed, `
      msg = msg.replace(/,\s*$/, '')
      setSteamMessage(`Unmatched games resolved: ${msg || 'none found'}.`)
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setResolving(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
        <Link2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to manage integrations.</p>
        </div>
        <Link
          to="/auth/login"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const query = searchQuery.toLowerCase().trim()

  const integrationDefs = [
    {
      id: 'steam',
      name: 'Steam',
      keywords: 'steam game library wishlist sign in valve',
      description: isSteamConnected && steamProfile?.personaname ? `Linked as ${steamProfile.personaname}` : 'Sign in with Steam, sync your game library, and import your wishlist.',
      isConnected: isSteamConnected,
      brandColor: BRAND_COLORS.steam,
      brandBg: BRAND_BG.steam,
      icon: SteamIcon,
      onConnect: handleConnect,
      connecting,
      onDisconnect: handleDisconnect,
      disconnecting,
    },
    {
      id: 'plex',
      name: 'Plex',
      keywords: 'plex media server watchlist library sync',
      description: isPlexConnected && plex?.plexUsername ? `Linked as ${plex.plexUsername}` : 'Link your Plex account to import and sync your media servers.',
      isConnected: isPlexConnected,
      brandColor: BRAND_COLORS.plex,
      brandBg: BRAND_BG.plex,
      icon: PlexIcon,
      onConnect: handlePlexConnect,
      connecting: plexConnecting,
      onDisconnect: handlePlexDisconnect,
      disconnecting: plexDisconnecting,
    },
    {
      id: 'spotify',
      name: 'Spotify',
      keywords: 'spotify music liked songs albums library sync',
      description: isSpotifyConnected && spotifyUsername ? `Linked as ${spotifyUsername}` : 'Link your Spotify account to sync your liked songs and saved albums.',
      isConnected: isSpotifyConnected,
      brandColor: BRAND_COLORS.spotify,
      brandBg: BRAND_BG.spotify,
      icon: SpotifyIcon,
      onConnect: handleSpotifyConnect,
      connecting: spotifyConnecting,
      onDisconnect: handleSpotifyDisconnect,
      disconnecting: spotifyDisconnecting,
    },
    {
      id: 'google',
      name: 'Google',
      keywords: 'google youtube music liked videos sync',
      description: isGoogleConnected && googleEmail ? `Linked as ${googleEmail}` : 'Link your Google account for YouTube Music and more.',
      isConnected: isGoogleConnected,
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      onConnect: handleGoogleConnect,
      connecting: googleConnecting,
      onDisconnect: handleGoogleDisconnect,
      disconnecting: googleDisconnecting,
    },
    {
      id: 'tmdb',
      name: 'TMDb',
      keywords: 'tmdb themoviedb ratings watchlist movies shows sync import',
      description: isTmdbConnected && tmdbUsername ? `Linked as ${tmdbUsername}` : 'Link your TMDb account to sync ratings and import your watchlist.',
      isConnected: isTmdbConnected,
      brandColor: BRAND_COLORS.tmdb,
      brandBg: BRAND_BG.tmdb,
      icon: TmdbIcon,
      onConnect: handleTmdbConnect,
      connecting: tmdbConnecting,
      onDisconnect: handleTmdbDisconnect,
      disconnecting: tmdbDisconnecting,
    },
  ]

  const filteredIntegrations = query
    ? integrationDefs.filter((i) =>
        i.name.toLowerCase().includes(query) ||
        i.keywords.includes(query) ||
        i.description.toLowerCase().includes(query)
      )
    : integrationDefs

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">Connect your Otix account to other platforms.</p>
      </div>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search integrations..."
          className="w-full h-9 rounded-xl bg-[var(--dk-surface-raised)] pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none ring-1 ring-border/30 focus:ring-primary/40 transition-all"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integrations...
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-8 text-center shadow-[var(--dk-shadow-md)]">
          <p className="text-sm text-muted-foreground">No integrations match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIntegrations.map((i) => (
            <IntegrationCard
              key={i.id}
              name={i.name}
              description={i.description}
              brandColor={i.brandColor}
              brandBg={i.brandBg}
              icon={i.icon}
              isConnected={i.isConnected}
              expanded={expandedId === i.id}
              onToggle={() => toggleExpand(i.id)}
              onConnect={i.onConnect}
              connecting={i.connecting}
              onDisconnect={i.onDisconnect}
              disconnecting={i.disconnecting}
            >
              {/* Steam content */}
              {i.id === 'steam' && (
                <>
                  <IntegrationProfile
                    avatarUrl={steamProfile?.avatarfull}
                    avatarAlt={steamProfile?.personaname ?? 'Steam avatar'}
                    name={steamProfile?.personaname ?? 'Steam User'}
                    detail={steamProfile?.realname ?? (displayedSteamId ? `Steam ID: ${displayedSteamId}` : 'Steam account linked')}
                    brandBg={BRAND_BG.steam}
                    icon={SteamIcon}
                    brandColor={BRAND_COLORS.steam}
                    meta={steamProfile?.profileurl && (
                      <a href={steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0">
                        View Profile &rarr;
                      </a>
                    )}
                  />
                  {steamProfile && (
                    <IntegrationStats items={[
                      ...(steamProfile.timecreated ? [{ label: 'account age', value: formatAccountAge(steamProfile.timecreated) }] : []),
                      ...(steamProfile.loccountrycode ? [{ label: 'location', value: steamProfile.loccountrycode }] : []),
                      ...(steamProfile.personastate !== null && steamProfile.personastate !== undefined ? [{ label: 'status', value: personaStateLabel(steamProfile.personastate) }] : []),
                    ]} />
                  )}
                  <IntegrationAction label="Library Sync" description="Steam Library" result={scanResult ? `${scanResult.matchedInOtix} matches out of ${scanResult.totalInSteam} games` : null} buttonLabel={scanning ? 'Scanning...' : scanResult ? 'Re-scan' : 'Scan Library'} buttonIcon={RefreshCw} onPress={handleScan} loading={scanning} />
                  <IntegrationAction label="Wishlist Sync" description="Steam Wishlist" result={wishlistScanResult ? `${wishlistScanResult.matched} matches out of ${wishlistScanResult.total} wishlist items` : null} buttonLabel={wishlistScanning ? 'Scanning...' : wishlistScanResult ? 'Re-scan' : 'Scan Wishlist'} buttonIcon={RefreshCw} onPress={handleWishlistScan} loading={wishlistScanning} muted />
                  <IntegrationAction label="Game Matching" description="Match unmapped games to IGDB" result={resolveResult ? `${resolveResult.resolved} linked${resolveResult.synced > 0 ? `, ${resolveResult.synced} synced` : ''}${resolveResult.failed > 0 ? `, ${resolveResult.failed} failed` : ''} out of ${resolveResult.total}` : null} buttonLabel={resolving ? 'Resolving...' : resolveResult ? 'Resolve Again' : 'Resolve Unmatched'} buttonIcon={Link2} onPress={handleResolveUnmatched} loading={resolving} />
                  {steamMessage && <p className="px-5 py-2 text-xs text-green-500">{steamMessage}</p>}
                  {steamError && <p className="px-5 py-2 text-xs text-destructive">{steamError}</p>}
                </>
              )}

              {/* Plex content */}
              {i.id === 'plex' && (
                <>
                  <IntegrationProfile
                    avatarUrl={plex?.plexThumb}
                    avatarAlt={plex?.plexUsername ?? 'Plex avatar'}
                    name={plex?.plexUsername ?? 'Plex User'}
                    detail={plex?.plexEmail ?? (plex?.plexId ?? user?.plexId ?? 'Plex account linked')}
                    brandBg={BRAND_BG.plex}
                    icon={PlexIcon}
                    brandColor={BRAND_COLORS.plex}
                  />
                  <IntegrationAction label="Library Sync" description="Plex Library" result={plexSyncResult ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded` : null} buttonLabel={plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync' : 'Sync Now'} buttonIcon={RefreshCw} onPress={handlePlexSync} loading={plexSyncing} progress={plexProgress && <span className="text-xs text-primary">{plexProgress.phase}</span>} />
                  <IntegrationAction label="Watchlist Sync" description="Plex Watchlist" result={plexWatchlistSyncResult ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items` : null} buttonLabel={plexWatchlistSyncing ? 'Syncing...' : plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'} buttonIcon={RefreshCw} onPress={handlePlexWatchlistSync} loading={plexWatchlistSyncing} muted />
                  {plexProgress && plexProgress.itemsTotal !== undefined && plexProgress.itemsTotal > 0 && (
                    <div className="px-5 py-3 space-y-1 border-t border-border/20">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{plexProgress.itemsProcessed ?? 0} / {plexProgress.itemsTotal} items</span>
                        <span>{plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal ? `${Math.round((plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100)}%` : ''}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal ? (plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {plexMessage && <p className="px-5 py-2 text-xs text-green-500">{plexMessage}</p>}
                  {plexError && <p className="px-5 py-2 text-xs text-destructive">{plexError}</p>}
                </>
              )}

              {/* Spotify content */}
              {i.id === 'spotify' && (
                <>
                  <IntegrationProfile
                    avatarUrl={spotifyAvatarUrl}
                    avatarAlt={spotifyUsername ?? 'Spotify avatar'}
                    name={spotifyUsername ?? 'Spotify User'}
                    detail="Spotify account linked"
                    brandBg={BRAND_BG.spotify}
                    icon={SpotifyIcon}
                    brandColor={BRAND_COLORS.spotify}
                  />
                  {spotifyStats && (
                    <IntegrationStats items={[
                      ...(spotifyStats.product ? [{ label: 'plan', value: String(spotifyStats.product) }] : []),
                      ...(spotifyStats.followers ? [{ label: 'followers', value: String(spotifyStats.followers) }] : []),
                      ...(spotifyStats.country ? [{ label: 'country', value: String(spotifyStats.country) }] : []),
                    ]} />
                  )}
                  <IntegrationAction label="Library Sync" description="Spotify Library" result={spotifySyncResult ? `${spotifySyncResult.likedMatched} matched out of ${spotifySyncResult.likedTotal} liked songs` : null} buttonLabel={spotifySyncing ? 'Syncing...' : spotifySyncResult ? 'Re-sync' : 'Sync Library'} buttonIcon={RefreshCw} onPress={handleSpotifySync} loading={spotifySyncing} disabled={spotifySyncing} progress={spotifyProgress && <span className="text-xs text-primary">{spotifyProgress.phase}{spotifyProgress.detail ? ` (${spotifyProgress.detail})` : ''}</span>} />
                  {spotifyMessage && <p className="px-5 py-2 text-xs text-green-500">{spotifyMessage}</p>}
                  {spotifyError && <p className="px-5 py-2 text-xs text-destructive">{spotifyError}</p>}
                </>
              )}

              {/* Google content */}
              {i.id === 'google' && (
                <>
                  <IntegrationProfile
                    avatarUrl={googleAvatarUrl}
                    avatarAlt={googleName ?? 'Google avatar'}
                    name={googleName ?? 'Google User'}
                    detail={googleEmail ?? 'Google account linked'}
                    brandBg={BRAND_BG.google}
                    icon={GoogleIcon}
                    brandColor={BRAND_COLORS.google}
                  />
                  <IntegrationAction label="YouTube Sync" description="YouTube Liked Videos" result={youtubeSyncResult ? `${youtubeSyncResult.total} videos (${youtubeSyncResult.matched} matched, ${youtubeSyncResult.music_videos} music)` : null} buttonLabel={youtubeSyncing ? 'Syncing...' : youtubeSyncResult ? 'Re-sync' : 'Sync Liked Videos'} buttonIcon={RefreshCw} onPress={handleYouTubeSync} loading={youtubeSyncing} disabled={youtubeSyncing} progress={youtubeProgress && <span className="text-xs text-primary">{youtubeProgress.phase}{youtubeProgress.detail ? ` (${youtubeProgress.detail})` : ''}</span>} />
                  {googleMessage && <p className="px-5 py-2 text-xs text-green-500">{googleMessage}</p>}
                  {googleError && <p className="px-5 py-2 text-xs text-destructive">{googleError}</p>}
                  {youtubeMessage && <p className="px-5 py-2 text-xs text-green-500">{youtubeMessage}</p>}
                  {youtubeError && <p className="px-5 py-2 text-xs text-destructive">{youtubeError}</p>}
                </>
              )}

              {/* TMDb content */}
              {i.id === 'tmdb' && (
                <>
                  <IntegrationProfile
                    avatarUrl={tmdbAvatarUrl}
                    avatarAlt={tmdbUsername ?? 'TMDb avatar'}
                    name={tmdbUsername ?? 'TMDb User'}
                    detail="TMDb account linked"
                    brandBg={BRAND_BG.tmdb}
                    icon={TmdbIcon}
                    brandColor={BRAND_COLORS.tmdb}
                  />
                  {tmdbStats && (
                    <IntegrationStats items={[
                      { label: 'rated movies', value: tmdbStats.ratedMovies },
                      { label: 'rated shows', value: tmdbStats.ratedTv },
                      { label: 'watchlist movies', value: tmdbStats.watchlistMovies },
                      { label: 'watchlist shows', value: tmdbStats.watchlistTv },
                    ]} />
                  )}
                  <IntegrationAction label="Rating Sync" description="Sync ratings between Otix and TMDb" result={tmdbSyncResult ? `${tmdbSyncResult.imported > 0 ? `${tmdbSyncResult.imported} imported` : ''}${tmdbSyncResult.imported > 0 && tmdbSyncResult.exported > 0 ? ', ' : ''}${tmdbSyncResult.exported > 0 ? `${tmdbSyncResult.exported} exported` : ''}${tmdbSyncResult.skipped > 0 ? ` (${tmdbSyncResult.skipped} skipped)` : ''}` : null} buttonLabel={tmdbSyncing ? 'Syncing...' : 'Sync Ratings'} buttonIcon={RefreshCw} onPress={handleTmdbRatingSync} loading={tmdbSyncing} disabled={tmdbSyncDirection === 'disabled'}>
                    <div className="mt-2">
                      <DkDropdown options={tmdbSyncDirections} value={tmdbSyncDirection} onChange={setTmdbSyncDirection} placeholder="Direction" />
                    </div>
                  </IntegrationAction>
                  <IntegrationAction label="Watchlist Import" description="Import your TMDb watchlist into Otix" result={tmdbWatchlistResult ? `${tmdbWatchlistResult.imported} imported, ${tmdbWatchlistResult.skipped} skipped` : null} buttonLabel={tmdbWatchlistImporting ? 'Importing...' : tmdbWatchlistResult ? 'Re-import' : 'Import'} buttonIcon={Download} onPress={handleTmdbWatchlistImport} loading={tmdbWatchlistImporting} muted />
                  {tmdbMessage && <p className="px-5 py-2 text-xs text-green-500">{tmdbMessage}</p>}
                  {tmdbError && <p className="px-5 py-2 text-xs text-destructive">{tmdbError}</p>}
                </>
              )}
            </IntegrationCard>
          ))}
        </div>
      )}
    </div>
  )
}

function AccountSection({
  user,
  isAuthenticated,
}: {
  user: {
    email: string
    username: string
    isVerified: boolean
    twoFactorEnabled: boolean
    dailyMoodCheckinsEnabled?: boolean
  } | null
  isAuthenticated: boolean
}) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [dailyMoodCheckinsEnabled, setDailyMoodCheckinsEnabled] = useState(user?.dailyMoodCheckinsEnabled ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verificationState, setVerificationState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!user) return
    setEmail(user.email)
    setUsername(user.username)
    setDailyMoodCheckinsEnabled(user.dailyMoodCheckinsEnabled ?? true)
  }, [user])

  if (!isAuthenticated) {
    return (
      <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
        <Shield className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to manage your account settings.</p>
        </div>
        <Link
          to="/auth/login"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        email,
        username,
        dailyMoodCheckinsEnabled,
      })
      setEmail(data.email)
      setUsername(data.username)
      setDailyMoodCheckinsEnabled(data.dailyMoodCheckinsEnabled ?? true)
      setSaved(true)
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    email !== (user?.email ?? '') ||
    username !== (user?.username ?? '') ||
    dailyMoodCheckinsEnabled !== (user?.dailyMoodCheckinsEnabled ?? true)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Identity" description="Your core account details." />

        <div className="space-y-5">
          <DkInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            hint="Used for sign-in and account recovery."
          />
          <DkInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            hint="Shown publicly on your profile and reviews."
          />
        </div>

        <div className="mt-6 border-t border-border/30 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Daily mood check-in</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Show the mood scale on the home page once per UTC day.
              </p>
            </div>
            <DkSwitch
              checked={dailyMoodCheckinsEnabled}
              onCheckedChange={setDailyMoodCheckinsEnabled}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border/30">
          <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save Changes
          </DkButton>
          {saved && <span className="text-xs text-green-500 animate-in fade-in">Saved</span>}
        </div>
      </div>

      <VerificationCard
        isVerified={user?.isVerified ?? false}
        state={verificationState}
        onSend={async () => {
          setVerificationState('sending')
          try {
            await apiClient.post('/auth/verify-email/send')
            setVerificationState('sent')
          } catch {
            setVerificationState('idle')
          }
        }}
      />

      <TwoFactorCard twoFactorEnabled={user?.twoFactorEnabled ?? false} />

      <SessionsCard />

      <div className="rounded-2xl bg-[var(--dk-surface-raised)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Danger Zone" description="Account lifecycle operations." />
        <p className="text-sm text-muted-foreground">
          Account deactivation and deletion are not yet available. Coming soon.
        </p>
      </div>
    </div>
  )
}
