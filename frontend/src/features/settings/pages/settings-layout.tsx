import { useState } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { ChevronDown, Shield, X } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { DkAvatar } from '@/old-features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { NAV_ITEMS, DESKTOP_SECTIONS } from '../constants'

export function SettingsLayout() {
  const location = useLocation()
  const { user } = useAuth()
  const desktop = isDesktop()
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeSection = location.pathname.replace('/settings/', '').split('/')[0] || 'profile'
  const filteredNav = NAV_ITEMS.filter(i => !DESKTOP_SECTIONS.has(i.id) || desktop)

  const navLinkClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
      isActive
        ? 'bg-white/10 text-white shadow-sm'
        : 'text-white/50 hover:text-white hover:bg-white/5',
    )

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      {/* ===== Mobile overlay ===== */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col sm:hidden"
          style={{
            backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.85)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
          }}
        >
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <h1 className="text-lg font-bold">Settings</h1>
            <button
              onClick={() => setMobileOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-4 py-4 overflow-y-auto">
            {/* General — always visible */}
            {filteredNav.filter(i => i.group === 'general').map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.id}
                  to={`/settings/${item.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={navLinkClass(activeSection === item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}

            {/* Desktop — separated */}
            {filteredNav.filter(i => i.group === 'desktop').length > 0 && (
              <div className="mt-4 mb-1 pt-3 border-t border-white/5">
                <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  Desktop
                </span>
              </div>
            )}
            {filteredNav.filter(i => i.group === 'desktop').map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.id}
                  to={`/settings/${item.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={navLinkClass(activeSection === item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {user && (
            <div className="border-t border-white/5 px-6 py-4">
              <div className="flex items-center gap-3">
                <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.username}
                    {user.isAdmin && (
                      <Shield className="h-3 w-3 inline-block ml-1 text-amber-400/80" />
                    )}
                  </p>
                  <p className="text-xs text-white/40 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Desktop layout ===== */}
      <div className="flex flex-col sm:flex-row gap-6 px-6 h-full">
        {/* Sidebar */}
        <aside className="hidden sm:flex flex-col w-56 shrink-0 h-full">
          <div
            className="glass-card flex flex-col h-full pt-8 pb-5 px-5"
            style={{ backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.3)' }}
          >
            <h1 className="text-lg font-bold mb-5">Settings</h1>
            <nav className="flex flex-col gap-1 flex-1">
              {/* General — always visible */}
              {filteredNav.filter(i => i.group === 'general').map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    to={`/settings/${item.id}`}
                    className={navLinkClass(activeSection === item.id)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}

              {/* Desktop — separated */}
              {filteredNav.filter(i => i.group === 'desktop').length > 0 && (
                <div className="mt-3 mb-1 pt-3 border-t border-white/5">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    Desktop
                  </span>
                </div>
              )}
              {filteredNav.filter(i => i.group === 'desktop').map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    to={`/settings/${item.id}`}
                    className={navLinkClass(activeSection === item.id)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {user && (
              <div className="mt-auto pt-4 border-t border-white/5">
                <div className="flex items-center gap-3 px-1 py-2">
                  <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.username}
                      {user.isAdmin && (
                        <Shield className="h-3 w-3 inline-block ml-1 text-amber-400/80" />
                      )}
                    </p>
                    <p className="text-xs text-white/40 truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Mobile nav trigger + Content */}
        <div className="flex flex-col gap-3 flex-1 min-w-0 min-h-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="sm:hidden flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors self-start"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
            {NAV_ITEMS.find(i => i.id === activeSection)?.label || 'Settings'}
          </button>

          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="min-h-full p-6 sm:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
