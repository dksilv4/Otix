import { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { ChevronDown, Shield, X, Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { DkAvatar } from '@/old-features/ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { NAV_ITEMS, DESKTOP_SECTIONS, getNavItems } from '../constants'
import { SettingsSaveProvider } from '../context/settings-save-context'
import { SettingsSaveBar } from '../components/molecules/settings-save-bar'

const SETTINGS_SIDEBAR_COLLAPSED_KEY = 'otix-settings-sidebar-collapsed'

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SETTINGS_SIDEBAR_COLLAPSED_KEY) === 'true'
}

function SettingsLayoutInner() {
  const location = useLocation()
  const { user } = useAuth()
  const desktop = isDesktop()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(getInitialCollapsed)
  const navRef = useRef<HTMLDivElement>(null)

  const activeSection = location.pathname.replace('/settings/', '').split('/')[0] || 'overview'
  const filteredNav = getNavItems().filter(i => !DESKTOP_SECTIONS.has(i.id) || desktop)

  // Listen for sidebar collapse changes from other components (e.g. Appearance page)
  useEffect(() => {
    const handleCollapseChange = () => {
      setCollapsed(getInitialCollapsed())
    }
    window.addEventListener('settings-sidebar-collapse-changed', handleCollapseChange)
    return () => window.removeEventListener('settings-sidebar-collapse-changed', handleCollapseChange)
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SETTINGS_SIDEBAR_COLLAPSED_KEY, String(next))
    window.dispatchEvent(new Event('settings-sidebar-collapse-changed'))
  }

  // Auto-scroll active nav item into view (sidebar overflow)
  useEffect(() => {
    if (!navRef.current) return
    const active = navRef.current.querySelector('[data-active="true"]') as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeSection])

  const navLinkClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200',
      isActive
        ? 'bg-white/10 text-white shadow-sm font-semibold'
        : 'text-white/50 hover:text-white hover:bg-white/5',
    )

  return (
    <div id="settings-layout" className="relative h-screen w-full overflow-hidden">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      {/* Page transition keyframes */}
      <style>{`
        @keyframes settings-enter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
            {/* Preferences Group */}
            <div className="mb-1">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Preferences
              </span>
            </div>
            {filteredNav.filter(i => i.group === 'preferences').map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <Link
                  key={item.id}
                  to={`/settings/${item.id}`}
                  data-active={isActive || undefined}
                  onClick={() => setMobileOpen(false)}
                  className={navLinkClass(isActive)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </Link>
              )
            })}

            {/* Account Group */}
            <div className="mt-4 mb-1 pt-3">
              <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40 flex items-center justify-between">
                <span>Account</span>
                {!user && (
                  <span className="text-[9px] lowercase font-normal px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                    sign in
                  </span>
                )}
              </span>
            </div>
            {filteredNav.filter(i => i.group === 'account').map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              const showLock = item.requiresAuth && !user
              return (
                <Link
                  key={item.id}
                  to={`/settings/${item.id}`}
                  data-active={isActive || undefined}
                  onClick={() => setMobileOpen(false)}
                  className={navLinkClass(isActive)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {showLock && <Lock className="h-3 w-3 text-white/30 shrink-0" />}
                </Link>
              )
            })}
          </nav>

          {user && (
            <div className="px-6 py-4">
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
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 px-2 sm:px-4 lg:px-6 h-full">
        {/* Sidebar */}
        <aside
          id="settings-sidebar"
          className={cn(
            "hidden sm:flex flex-col shrink-0 h-full pb-6 transition-all duration-300 ease-in-out",
            collapsed ? "w-16 lg:w-20" : "w-56 lg:w-64",
            desktop ? "pt-24 sm:pt-28" : "pt-16 sm:pt-20"
          )}
        >
          <div
            className={cn(
              "glass-card flex flex-col h-full pt-6 pb-5 transition-all duration-300",
              collapsed ? "px-2 items-center" : "px-5"
            )}
            style={{ backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.3)' }}
          >
            {/* Header with collapse button */}
            <div className={cn("flex items-center mb-5 w-full", collapsed ? "justify-center" : "justify-between")}>
              {!collapsed && <h1 className="text-lg font-bold">Settings</h1>}
              <button
                type="button"
                onClick={toggleCollapsed}
                title={collapsed ? "Expand settings menu" : "Collapse settings menu"}
                aria-label={collapsed ? "Expand settings menu" : "Collapse settings menu"}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
              </button>
            </div>

            <nav ref={navRef} className={cn("flex flex-col gap-1 flex-1 overflow-y-auto pr-1 w-full", collapsed && "items-center")}>
              {/* Preferences Group */}
              {!collapsed ? (
                <div className="mb-1">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    Preferences
                  </span>
                </div>
              ) : null}

              {filteredNav.filter(i => i.group === 'preferences').map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <Link
                    key={item.id}
                    to={`/settings/${item.id}`}
                    data-active={isActive || undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      navLinkClass(isActive),
                      collapsed && "justify-center px-0 py-2.5 w-10 h-10 rounded-xl"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  </Link>
                )
              })}

              {/* Account Group */}
              {!collapsed ? (
                <div className="mt-4 mb-1 pt-3">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40 flex items-center justify-between">
                    <span>Account</span>
                    {!user && (
                      <span className="text-[9px] lowercase font-normal px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                        sign in
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="my-2 h-px w-8 bg-white/10 shrink-0" />
              )}

              {filteredNav.filter(i => i.group === 'account').map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                const showLock = item.requiresAuth && !user
                return (
                  <Link
                    key={item.id}
                    to={`/settings/${item.id}`}
                    data-active={isActive || undefined}
                    title={collapsed ? `${item.label}${showLock ? ' (Requires Sign In)' : ''}` : undefined}
                    className={cn(
                      navLinkClass(isActive),
                      collapsed && "justify-center px-0 py-2.5 w-10 h-10 rounded-xl relative"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {showLock && <Lock className="h-3 w-3 text-white/30 shrink-0" />}
                      </>
                    )}
                    {collapsed && showLock && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                    )}
                  </Link>
                )
              })}
            </nav>

            {user && (
              <div className={cn("mt-auto pt-4 w-full", collapsed && "flex justify-center")}>
                {!collapsed ? (
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
                ) : (
                  <div title={`${user.username} (${user.email})`} className="p-1">
                    <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Mobile nav trigger + Content */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 h-full">
          <main id="settings-content" className="flex-1 min-w-0 overflow-y-auto scroll-smooth">
            <div
              key={location.pathname}
              className={cn(
                "min-h-full w-full max-w-5xl xl:max-w-6xl mx-auto px-1 sm:px-3 lg:px-4 pb-28",
                desktop ? "pt-24 sm:pt-28 lg:pt-32" : "pt-16 sm:pt-20 lg:pt-24"
              )}
              style={{ animation: 'settings-enter 0.2s ease-out' }}
            >
              <button
                onClick={() => setMobileOpen(true)}
                className="sm:hidden flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors self-start mb-4 px-2 py-1"
              >
                <ChevronDown className="h-4 w-4 rotate-90" />
                {NAV_ITEMS.find(i => i.id === activeSection)?.label || 'Settings'}
              </button>
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <SettingsSaveBar />
    </div>
  )
}

export function SettingsLayout() {
  return (
    <SettingsSaveProvider>
      <SettingsLayoutInner />
    </SettingsSaveProvider>
  )
}
