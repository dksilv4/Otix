import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Search, ArrowRight, Shield, User, Lock, Sparkles, Settings } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { DkAvatar } from '@/old-features/ui/atoms/avatar'

import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '../constants'
import type { NavItem } from '../constants'
import { SettingsCard } from '../components/molecules/settings-card'

const ITEM_DESCRIPTIONS: Record<string, string> = {
  appearance: 'Customize themes, color accents, and dark/light mode preferences.',
  general: 'Choose your default landing page, auto-slideshows, and launcher views.',
  notifications: 'Configure local sound chimes, quiet hours, and social activity alerts.',
  desktop: 'System tray behavior, startup options, and hardware acceleration.',
  library: 'Scan local game folders, manage ISO directories, and view scanned games.',
  integrations: 'Connect Plex, YouTube, Steam, Trakt, and AniList accounts.',
  plugins: 'Browse, install, and manage extensions and community plugins.',
  profile: 'Customize your public avatar, cover photo, bio, and social links.',
  account: 'Manage account credentials, email verification, 2FA, and active sessions.',
  proposals: 'Review and participate in community feature proposals and voting.',
}

export function SettingsOverviewPage() {
  const { user } = useAuth()
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
    <div id="settings-overview-section" className="space-y-5">
      {/* ===== Header Welcome Banner ===== */}
      <SettingsCard className="bg-gradient-to-r from-primary/15 via-transparent to-transparent">
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
      </SettingsCard>

      {/* ===== Quick Search Bar ===== */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings (e.g. Theme, 2FA, Scanners, Sounds, Steam)..."
          className="w-full rounded-2xl bg-white/5 pl-11 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none backdrop-blur-xl transition-all"
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
      className="group relative rounded-2xl p-5 hover:bg-white/[0.08] backdrop-blur-xl transition-all duration-200 flex flex-col justify-between gap-4 no-underline hover:-translate-y-0.5"
      style={{
        backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.18)',
        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.07)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 group-hover:bg-primary/20 transition-all duration-200">
            <Icon className="h-5.5 w-5.5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white group-hover:text-primary transition-colors flex items-center gap-2">
              <span>{item.label}</span>
              {isLocked && <Lock className="h-3.5 w-3.5 text-white/30" />}
            </h4>
            <p className="text-xs text-white/50 mt-1 leading-relaxed line-clamp-2">{description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-xs text-white/40 group-hover:text-white/80 transition-colors">
        <span>{isLocked ? 'Sign in to access' : 'Configure section'}</span>
        <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  )
}
