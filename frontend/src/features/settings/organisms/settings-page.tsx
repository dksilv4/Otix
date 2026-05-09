import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { Moon, Sun, User, Palette, Shield, Pencil, Plus, X, Link2, Upload, Image } from 'lucide-react'
import { SHADER_QUALITY_OPTIONS, useShaderQuality } from '@/lib/shader-quality'
import { useTheme } from '@/lib/theme'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { DkInput } from '@/features/dk-ui/atoms/input'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'

const BIO_MAX_LENGTH = 250

type Section = 'profile' | 'appearance' | 'account'

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'account', label: 'Account', icon: Shield },
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('profile')
  const { theme, toggleTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()

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
                    onClick={() => setActiveSection(item.id)}
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
        </main>
      </div>
    </div>
  )
}

// ── Profile ──

function ProfileSection({
  user,
  isAuthenticated,
}: {
  user: { email: string; username: string; bio?: string | null; avatarUrl?: string | null; backgroundUrl?: string | null } | null
  isAuthenticated: boolean
}) {
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(user?.backgroundUrl ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
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

  const hasChanges =
    bio !== (user?.bio ?? '') ||
    avatarUrl !== (user?.avatarUrl ?? '') ||
    backgroundUrl !== (user?.backgroundUrl ?? '')

  const applyCoverEditor = async (url: string) => {
    setBackgroundUrl(url)
    setEditingCover(false)
    setSaving(true)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        bio: bio || null,
        avatar_url: avatarUrl || null,
        background_url: url || null,
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
        className="relative overflow-hidden rounded-3xl shadow-[var(--dk-shadow-md)]"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }}
      >
        {/* Gradient atmosphere over the full card */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 via-40% to-black/70 pointer-events-none" />

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
        <div className="relative bg-gradient-to-b from-transparent via-black/30 to-black/60 px-6 pb-6 pt-4">
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

type AccentId = (typeof ACCENTS)[number]['id']

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

function AccountSection({
  user,
  isAuthenticated,
}: {
  user: { email: string; username: string } | null
  isAuthenticated: boolean
}) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

      <div className="rounded-2xl bg-[var(--dk-surface-raised)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Danger Zone" description="Account lifecycle operations." />
        <p className="text-sm text-muted-foreground">
          Account deactivation and deletion are not yet available. Coming soon.
        </p>
      </div>
    </div>
  )
}
