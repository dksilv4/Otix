import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { Moon, Sun, User, Palette, Shield, Pencil } from 'lucide-react'
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

      <div className="flex gap-8 mt-6">
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
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingAvatar) avatarInputRef.current?.focus()
  }, [editingAvatar])
  useEffect(() => {
    if (editingCover) coverInputRef.current?.focus()
  }, [editingCover])

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-12 text-center space-y-4">
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">Customize your public profile.</p>
      </div>

      {/* Cover image */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
        <div
          className="relative h-48 group"
          style={{
            background: backgroundUrl
              ? `url(${backgroundUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {editingCover ? (
            <div className="absolute inset-x-0 bottom-4 mx-auto max-w-md px-4">
              <div className="flex items-center gap-2">
                <input
                  ref={coverInputRef}
                  type="url"
                  value={backgroundUrl}
                  onChange={(e) => setBackgroundUrl(e.target.value)}
                  placeholder="Paste cover image URL..."
                  className="flex-1 h-10 rounded-lg bg-black/60 backdrop-blur-md px-3 text-sm text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary/60"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingCover(false)
                    if (e.key === 'Escape') { setEditingCover(false); setBackgroundUrl(user?.backgroundUrl ?? '') }
                  }}
                  onBlur={() => setEditingCover(false)}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingCover(true)}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-black/70 hover:text-white transition-all"
            >
              <Pencil className="h-3 w-3" />
              Change Cover
            </button>
          )}
        </div>

        {/* Avatar + name + bio */}
        <div className="bg-[var(--dk-surface-glass)] px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="ring-4 ring-[var(--dk-surface-glass)] rounded-full">
                <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
              </div>
              {editingAvatar ? (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-48">
                  <input
                    ref={avatarInputRef}
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="Paste avatar URL..."
                    className="w-full h-8 rounded-md bg-black/80 backdrop-blur-md px-2 text-xs text-white placeholder:text-white/40 border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary/60"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingAvatar(false)
                      if (e.key === 'Escape') { setEditingAvatar(false); setAvatarUrl(user?.avatarUrl ?? '') }
                    }}
                    onBlur={() => setEditingAvatar(false)}
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

            <div className="pb-1 min-w-0 flex-1">
              <h3 className="text-lg font-bold">{user.username}</h3>
            </div>
          </div>

          {/* Bio — inline editable */}
          <div className="mt-4">
            <textarea
              value={bio}
              onChange={(e) => {
                if (e.target.value.length <= BIO_MAX_LENGTH) setBio(e.target.value)
              }}
              placeholder="Write a short bio..."
              rows={2}
              className="w-full rounded-xl bg-[var(--dk-surface-base)] px-4 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--dk-ring-color)] focus:ring-offset-1 resize-none transition-all"
            />
            <p className="text-[11px] text-muted-foreground/50 text-right mt-1">
              {bio.length}/{BIO_MAX_LENGTH}
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

// ── Appearance ──

function AppearanceSection({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-6">
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-base)] px-4 py-4">
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
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-12 text-center space-y-4">
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
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-6">
        <SectionHeader title="Identity" description="Your core account details." />

        <div className="space-y-5">
          <DkInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
          <DkInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
          />
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border/30">
          <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save Changes
          </DkButton>
          {saved && <span className="text-xs text-green-500 animate-in fade-in">Saved</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-glass)] p-6">
        <SectionHeader title="Danger Zone" description="Account lifecycle operations." />
        <p className="text-sm text-muted-foreground">
          Account deactivation and deletion are not yet available. Coming soon.
        </p>
      </div>
    </div>
  )
}
