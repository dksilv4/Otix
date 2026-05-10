import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { Moon, Sun, User, Palette, Shield, Pencil, Plus, X, Link2, Upload, Image, Check, ShieldAlert, Loader2, Monitor, Unlink, RefreshCw } from 'lucide-react'
import { SHADER_QUALITY_OPTIONS, useShaderQuality } from '@/lib/shader-quality'
import { useTheme } from '@/lib/theme'
import { useAuth } from '@/features/auth/auth-provider'
import { fetchSessions, revokeSession, revokeOtherSessions, type SessionInfo } from '@/features/auth/session-queries'
import { apiClient, API_BASE_URL } from '@/lib/api-client'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { DkInput } from '@/features/dk-ui/atoms/input'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { SteamIcon } from "@/features/dk-ui/atoms/steam-icon"
import plexLogo from '@/assets/provider-logos/plex.svg'

const BIO_MAX_LENGTH = 250

type Section = 'profile' | 'appearance' | 'account' | 'integrations'

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
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
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()

  const handleSectionChange = (section: Section) => {
    setActiveSection(section)
    navigate({
      to: '/settings',
      search: section === 'profile' ? {} : ({ section } as never),
      replace: true,
    })
  }

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      <div className="mt-6 flex gap-8">
        <aside className="w-56 shrink-0">
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
                    <p className="text-sm font-medium truncate">{user.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          {activeSection === 'profile' && (
            <ProfileSection user={user} isAuthenticated={isAuthenticated} />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection theme={theme} onToggle={toggleTheme} />
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

// ── Profile ──

function ProfileSection({
  user,
  isAuthenticated,
}: {
  user: {
    email: string
    username: string
    bio?: string | null
    avatarUrl?: string | null
    backgroundUrl?: string | null
    steamId?: string | null
    plexId?: string | null
    integrationVisibility?: Record<string, string> | null
  } | null
  isAuthenticated: boolean
}) {
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(user?.backgroundUrl ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [steamVisibility, setSteamVisibility] = useState(
    user?.integrationVisibility?.steam ?? 'hidden'
  )
  const [plexVisibility, setPlexVisibility] = useState(
    user?.integrationVisibility?.plex ?? 'hidden'
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
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const integrationVisibility = { steam: steamVisibility, plex: plexVisibility }

  const hasChanges =
    bio !== (user?.bio ?? '') ||
    avatarUrl !== (user?.avatarUrl ?? '') ||
    backgroundUrl !== (user?.backgroundUrl ?? '') ||
    steamVisibility !== (user?.integrationVisibility?.steam ?? 'hidden') ||
    plexVisibility !== (user?.integrationVisibility?.plex ?? 'hidden')

  const applyCoverEditor = async (url: string) => {
    setBackgroundUrl(url)
    setEditingCover(false)
    setSaving(true)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: avatarUrl || null,
        background_url: url || null,
        integration_visibility: integrationVisibility,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const applyAvatarEditor = async (url: string) => {
    setAvatarUrl(url)
    setEditingAvatar(false)
    setSaving(true)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: url || null,
        background_url: backgroundUrl || null,
        integration_visibility: integrationVisibility,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setSaved(true)
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
          {editingCover ? (
            <div className="absolute inset-x-4 bottom-4 md:left-auto md:right-4 md:w-[28rem] z-20">
              <AssetEditor
                label="Cover Image"
                value={backgroundUrl}
                onSubmit={applyCoverEditor}
                onCancel={() => setEditingCover(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingCover(true)}
              className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-black/70 hover:text-white transition-all"
            >
              <Pencil className="h-3 w-3" />
              Change Cover
            </button>
          )}
        </div>

        {/* Avatar + name + bio — glass overlay */}
        <div className="relative bg-gradient-to-b from-transparent via-black/30 to-black/60 px-6 pb-6 pt-4 rounded-b-3xl">
          <div className="flex items-end gap-4 -mt-16">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="rounded-full ring-4 ring-white/10">
                <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
              </div>
              {editingAvatar ? (
                <div className="absolute left-0 top-full z-20 mt-3">
                  <AssetEditor
                    compact
                    label="Avatar Image"
                    value={avatarUrl}
                    onSubmit={applyAvatarEditor}
                    onCancel={() => setEditingAvatar(false)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingAvatar(true)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-4 w-4 text-white" />
                </button>
              )}
            </div>

            <div className="pb-1 min-w-0 flex-1 relative z-10">
              <h3 className="text-lg font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{user.username}</h3>
            </div>
          </div>

          {/* Bio — inline editable */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="profile-bio" className="text-sm font-medium text-white/90">
                Bio
              </label>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] tabular-nums bg-white/10 backdrop-blur-sm',
                  bio.length > BIO_MAX_LENGTH * 0.85
                    ? 'text-primary'
                    : 'text-white/60',
                )}
              >
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
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
            <p className="mt-2 text-[11px] text-white/40">
              Keep it short. This appears on your public profile.
            </p>
          </div>
        </div>
      </div>

      {/* Integration visibility — separate section outside the profile card */}
      {(user.steamId || user.plexId) && (
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
          </div>
        </div>
      )}

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

function AssetEditor({
  compact = false,
  label,
  onCancel,
  onSubmit,
  value,
}: {
  compact?: boolean
  label: string
  onCancel: () => void
  onSubmit: (url: string) => void
  value: string
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [urlDraft, setUrlDraft] = useState(value)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    }
  }, [previewObjectUrl])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    setSelectedFile(file)
    setPreviewObjectUrl(URL.createObjectURL(file))
  }

  const handleApply = async () => {
    if (mode === 'file' && selectedFile) {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)
        const { data } = await apiClient.post('/upload', formData)
        onSubmit(data.url)
      } catch {
        // upload failed, stay in editor
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

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/25">
          {mode === 'file' ? 'Pick a file and apply.' : 'Enter applies. Escape cancels.'}
        </p>
        <div className="flex items-center gap-2">
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

function AppearanceSection({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  const { shaderQuality, setShaderQuality } = useShaderQuality()
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
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {theme === 'dark' ? 'Dark' : 'Light'} mode
              </p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark' ? 'Easier on the eyes at night' : 'Bright and crisp for daytime'}
              </p>
            </div>
          </div>
          <DkSwitch
            checked={theme === 'light'}
            onCheckedChange={onToggle}
            label={theme === 'dark' ? 'Dark' : 'Light'}
          />
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

function PersonaStateBadge({ state }: { state: number | null }) {
  if (state === null || state === undefined) return null
  const states: Record<number, { label: string; color: string }> = {
    0: { label: 'Offline', color: 'bg-muted-foreground/30' },
    1: { label: 'Online', color: 'bg-green-500' },
    2: { label: 'Busy', color: 'bg-amber-500' },
    3: { label: 'Away', color: 'bg-amber-500/70' },
    4: { label: 'Snooze', color: 'bg-blue-400/60' },
    5: { label: 'Looking to trade', color: 'bg-sky-400' },
    6: { label: 'Looking to play', color: 'bg-sky-400' },
  }
  const s = states[state] ?? { label: 'Unknown', color: 'bg-muted-foreground/30' }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={cn('inline-block h-2 w-2 rounded-full', s.color)} />
      {s.label}
    </span>
  )
}

function extractIntegrationMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

const integrationConnectButton = 'w-40 shrink-0 shadow-none'
const integrationSyncButton = 'w-40 shrink-0 bg-primary/10 text-primary shadow-none hover:bg-primary/15'
const integrationDangerButton = 'w-40 shrink-0 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15'
const integrationActionRow = 'border-t border-border/20 px-4 py-4'
const integrationActionHeader = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60'

function IntegrationsSection() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ totalInSteam: number; matchedInOtix: number } | null>(null)
  const [wishlistScanning, setWishlistScanning] = useState(false)
  const [wishlistScanResult, setWishlistScanResult] = useState<{ total: number; matched: number; private?: boolean } | null>(null)
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
  const isSteamConnected = steamConnected || Boolean(user?.steamId)
  const displayedSteamId = steamId ?? user?.steamId ?? null
  const isPlexConnected = plexConnected || Boolean(user?.plexId)

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">Connect your Otix account to other platforms.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integrations...
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
          <SectionHeader
            title="Steam"
            description={isSteamConnected && steamProfile?.personaname
              ? `Linked to "${steamProfile.personaname}"`
              : 'Link your Steam account to sign in with Steam and show off your profile.'
            }
          />

          {isSteamConnected ? (
            <div className="rounded-xl bg-[var(--dk-surface-raised)] shadow-[var(--dk-shadow-xs)] overflow-hidden">
              {/* Profile card */}
              <div className="flex items-start gap-4 p-4">
                {/* Avatar */}
                <div className="shrink-0">
                  {steamProfile?.avatarfull ? (
                    <img
                      src={steamProfile.avatarfull}
                      alt={steamProfile.personaname ?? 'Steam avatar'}
                      className="h-14 w-14 rounded-xl ring-2 ring-border/20"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--dk-surface-overlay)]">
                      <SteamIcon className="h-7 w-7 opacity-40" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">
                      {steamProfile?.personaname ?? 'Steam User'}
                    </p>
                    {steamProfile?.personastate !== null && steamProfile?.personastate !== undefined && (
                      <PersonaStateBadge state={steamProfile.personastate} />
                    )}
                  </div>

                  {steamProfile?.realname && (
                    <p className="text-xs text-muted-foreground mt-0.5">{steamProfile.realname}</p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-muted-foreground/70">
                    {steamProfile?.profileurl && (
                      <a
                        href={steamProfile.profileurl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                      >
                        <Link2 className="h-3 w-3" />
                        Steam Profile
                      </a>
                    )}
                    {steamProfile?.timecreated && (
                      <span>{formatAccountAge(steamProfile.timecreated)}</span>
                    )}
                    {steamProfile?.loccountrycode && (
                      <span className="rounded bg-[var(--dk-surface-overlay)] px-1.5 py-0.5 font-mono text-[10px]">
                        {steamProfile.loccountrycode}
                      </span>
                    )}
                  </div>

                  {displayedSteamId && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground/40 font-mono">
                      Steam ID: {displayedSteamId}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  <span className={integrationActionHeader}>Account</span>
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleDisconnect}
                    loading={disconnecting}
                    className={integrationDangerButton}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" />
                    Unlink
                  </DkButton>
                  {steamProfile?.profileurl && (
                    <a
                      href={steamProfile.profileurl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground/50 hover:text-primary transition-colors"
                    >
                      View on Steam &rarr;
                    </a>
                  )}
                </div>
              </div>

              <div className={cn(integrationActionRow, 'flex items-center justify-between gap-4')}>
                <div className="min-w-0">
                  <p className={integrationActionHeader}>Library Sync</p>
                  <p className="mt-1 text-sm font-medium">Steam Library</p>
                  <p className="text-xs text-muted-foreground">
                    {scanResult
                      ? `${scanResult.matchedInOtix} matches out of ${scanResult.totalInSteam} games`
                      : 'Import your Steam games into Otix'}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={handleScan}
                  loading={scanning}
                  className={integrationSyncButton}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {scanning ? "Scanning..." : scanResult ? "Re-scan" : "Scan Library"}
                </DkButton>
              </div>

              <div className={cn(integrationActionRow, 'flex items-center justify-between gap-4 bg-[var(--dk-surface-overlay)]/30')}>
                <div className="min-w-0">
                  <p className={integrationActionHeader}>Wishlist Sync</p>
                  <p className="mt-1 text-sm font-medium">Steam Wishlist</p>
                  <p className="text-xs text-muted-foreground">
                    {wishlistScanResult
                      ? `${wishlistScanResult.matched} matches out of ${wishlistScanResult.total} wishlist items`
                      : 'Import your Steam wishlist into Otix'}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={handleWishlistScan}
                  loading={wishlistScanning}
                  className={integrationSyncButton}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {wishlistScanning ? "Scanning..." : wishlistScanResult ? "Re-scan" : "Scan Wishlist"}
                </DkButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted-foreground/10 text-muted-foreground">
                  <SteamIcon className="h-5 w-5 opacity-70" />
                </div>
                <div>
                  <p className="text-sm font-medium">Not connected</p>
                  <p className="text-xs text-muted-foreground">
                    Sign in with your Steam account to link it.
                  </p>
                </div>
              </div>
              <DkButton
                size="sm"
                variant="primary"
                onClick={handleConnect}
                loading={connecting}
                className={integrationConnectButton}
              >
                Connect Steam
              </DkButton>
            </div>
          )}

          {steamMessage && <p className="mt-3 text-xs text-green-500 animate-in fade-in">{steamMessage}</p>}
          {steamError && <p className="mt-3 text-xs text-destructive">{steamError}</p>}
        </div>
      )}

      {!loading && (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
          <SectionHeader
            title="Plex"
            description={isPlexConnected && plex?.plexUsername
              ? `Linked to "${plex.plexUsername}"`
              : 'Link your Plex account to import and sync your media servers.'
            }
          />

          {isPlexConnected ? (
            <div className="rounded-xl bg-[var(--dk-surface-raised)] shadow-[var(--dk-shadow-xs)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {plex?.plexThumb ? (
                    <img src={plex.plexThumb} alt={plex.plexUsername ?? 'Plex avatar'} className="h-10 w-10 rounded-xl" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5a00d]/15">
                      <img src={plexLogo} alt="" className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{plex?.plexUsername ?? 'Plex User'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {plex?.plexEmail ?? plex?.plexId ?? user?.plexId}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <span className={integrationActionHeader}>Account</span>
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handlePlexDisconnect}
                    loading={plexDisconnecting}
                    className={integrationDangerButton}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" />
                    Unlink
                  </DkButton>
                </div>
              </div>
              <div className={cn(integrationActionRow, 'flex items-center justify-between gap-4')}>
                <div className="min-w-0">
                  <p className={integrationActionHeader}>Library Sync</p>
                  <p className="mt-1 text-sm font-medium">Plex Library</p>
                  <p className="text-xs text-muted-foreground">
                    {plexSyncResult
                      ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded`
                      : 'Discover servers, import libraries, and sync watch state'}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={handlePlexSync}
                  loading={plexSyncing}
                  className={integrationSyncButton}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync' : 'Sync Now'}
                </DkButton>
              </div>

              <div className={cn(integrationActionRow, 'flex items-center justify-between gap-4 bg-[var(--dk-surface-overlay)]/30')}>
                <div className="min-w-0">
                  <p className={integrationActionHeader}>Watchlist Sync</p>
                  <p className="mt-1 text-sm font-medium">Plex Watchlist</p>
                  <p className="text-xs text-muted-foreground">
                    {plexWatchlistSyncResult
                      ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items`
                      : 'Import your Plex watchlist into Otix'}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  onClick={handlePlexWatchlistSync}
                  loading={plexWatchlistSyncing}
                  className={integrationSyncButton}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {plexWatchlistSyncing ? "Syncing..." : plexWatchlistSyncResult ? "Re-sync" : "Sync Watchlist"}
                </DkButton>
              </div>

              {plexProgress && (
                <div className="border-t border-border/20 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    <p className="text-sm">{plexProgress.phase}</p>
                  </div>
                  {plexProgress.itemsTotal !== undefined && plexProgress.itemsTotal > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{plexProgress.itemsProcessed ?? 0} / {plexProgress.itemsTotal} items</span>
                        <span>
                          {plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal
                            ? `${Math.round((plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100)}%`
                            : ''}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{
                            width: `${plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal
                              ? (plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100
                              : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5a00d]/15">
                  <img src={plexLogo} alt="" className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Not connected</p>
                  <p className="text-xs text-muted-foreground">Authorize Otix with your Plex account.</p>
                </div>
              </div>
              <DkButton
                size="sm"
                variant="primary"
                onClick={handlePlexConnect}
                loading={plexConnecting}
                className={integrationConnectButton}
              >
                Connect Plex
              </DkButton>
            </div>
          )}
          {plexMessage && <p className="mt-3 text-xs text-green-500 animate-in fade-in">{plexMessage}</p>}
          {plexError && <p className="mt-3 text-xs text-destructive">{plexError}</p>}
        </div>
      )}
    </div>
  )
}

function AccountSection({
  user,
  isAuthenticated,
}: {
  user: { email: string; username: string; isVerified: boolean; twoFactorEnabled: boolean } | null
  isAuthenticated: boolean
}) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verificationState, setVerificationState] = useState<'idle' | 'sending' | 'sent'>('idle')

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
      const { data } = await apiClient.patch('/auth/me', { email, username })
      setEmail(data.email)
      setUsername(data.username)
      setSaved(true)
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    email !== (user?.email ?? '') || username !== (user?.username ?? '')

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
