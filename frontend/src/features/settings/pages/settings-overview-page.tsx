import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Search, ArrowRight, Shield, User, Palette, Settings, Lock, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { DkAvatar } from '@/old-features/ui/atoms/avatar'
import { useTheme } from '@/lib/providers/theme'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '../constants'
import type { NavItem } from '../constants'

const ITEM_DESCRIPTIONS: Record<string, string> = {
  appearance: 'Customize themes, color accents, and dark/light mode preferences.',
  general: 'Choose your default landing page, auto-slideshows, and launcher views.',
  notifications: 'Configure local sound chimes, quiet hours, and social activity alerts.',
  desktop: 'System tray behavior, startup options, and hardware acceleration.',
  library: 'Scan local game folders, manage ISO directories, and view scanned games.',
  integrations: 'Connect Plex, YouTube, Spotify, Steam, Trakt, and AniList accounts.',
  plugins: 'Browse, install, and manage extensions and community plugins.',
  profile: 'Customize your public avatar, cover photo, bio, and social links.',
  account: 'Manage account credentials, email verification, 2FA, and active sessions.',
  proposals: 'Review and participate in community feature proposals and voting.',
}

export function SettingsOverviewPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItems = useMemo(() => {
    // Exclude overview itself from the grid items
    const nav = NAV_ITEMS.filter((i) => i.id !== 'overview')
    if (!searchQuery.trim()) return nav
    const q = searchQuery.toLowerCase()
    return nav.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (ITEM_DESCRIPTIONS[item.id] || '').toLowerCase().includes(q),
    )
  }, [searchQuery])

  const prefItems = useMemo(() => filteredItems.filter((i) => i.group === 'preferences'), [filteredItems])
  const accountItems = useMemo(() => filteredItems.filter((i) => i.group === 'account'), [filteredItems])

  return (
    <div id="settings-overview-section" className="space-y-8">
      {/* ===== Header Welcome Banner ===== */}
      <div className="relative rounded-3xl p-6 sm:p-8 overflow-hidden bg-gradient-to-r from-primary/15 via-white/5 to-white/5 backdrop-blur-xl">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <DkAvatar src={user?.avatarUrl} name={user?.username || 'Guest'} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {user ? `Welcome, ${user.username}` : 'Settings Overview'}
                </h2>
                {user?.isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    <Shield className="h-3 w-3" /> Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60 mt-1 max-w-md leading-relaxed">
                {user
                  ? 'Manage your preferences, connected services, notification rules, and security credentials.'
                  : 'Customize app behaviors, visual themes, local game scanners, and device notifications.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {user ? (
              <Link
                to="/settings/profile"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-all shadow-sm"
              >
                <User className="h-4 w-4" />
                <span>Edit Profile</span>
              </Link>
            ) : (
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ===== Quick Search Bar ===== */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings (e.g. Theme, 2FA, Scanners, Sounds, Steam)..."
          className="w-full rounded-2xl bg-white/5 pl-11 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 backdrop-blur-xl transition-all shadow-inner"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ===== Quick Controls Banner ===== */}
      <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-6 bg-white/5 backdrop-blur-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-4">Quick Preferences</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Quick Theme Switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Palette className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Appearance Theme</p>
                <p className="text-[11px] text-white/50 capitalize">{theme} mode</p>
              </div>
            </div>
            <div className="flex rounded-lg p-0.5 bg-white/10 text-[11px]">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer',
                    theme === t ? 'bg-primary text-primary-foreground shadow-xs' : 'text-white/60 hover:text-white',
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Landing Page Link */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Settings className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">App General Options</p>
                <p className="text-[11px] text-white/50">Landing page & slideshows</p>
              </div>
            </div>
            <Link
              to="/settings/general"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <span>Manage</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Preferences Category ===== */}
      {prefItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              <span>Preferences & Devices</span>
            </h3>
            <span className="text-xs text-white/40">{prefItems.length} categories</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prefItems.map((item) => (
              <CategoryCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* ===== Account & Governance Category ===== */}
      {accountItems.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span>Account & Security</span>
            </h3>
            <span className="text-xs text-white/40">{accountItems.length} categories</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accountItems.map((item) => (
              <CategoryCard key={item.id} item={item} user={user} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryCard({ item, user }: { item: NavItem; user?: any }) {
  const Icon = item.icon
  const description = ITEM_DESCRIPTIONS[item.id] || 'Configure options and preferences.'
  const isLocked = item.requiresAuth && !user

  return (
    <Link
      to={`/settings/${item.id}`}
      className="group relative rounded-2xl p-5 bg-white/5 hover:bg-white/[0.08] backdrop-blur-xl transition-all duration-200 shadow-md flex flex-col justify-between gap-4 no-underline hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
            <Icon className="h-5.5 w-5.5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-primary transition-colors flex items-center gap-2">
              <span>{item.label}</span>
              {isLocked && <Lock className="h-3.5 w-3.5 text-white/30" />}
            </h4>
            <p className="text-xs text-white/60 mt-1 leading-relaxed line-clamp-2">{description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 text-xs text-white/40 group-hover:text-white/80 transition-colors">
        <span>{isLocked ? 'Sign in to access' : 'Configure section'}</span>
        <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  )
}
