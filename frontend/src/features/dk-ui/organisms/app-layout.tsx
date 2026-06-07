import { useState, useCallback } from 'react'
import { Link, useRouter, useLocation } from '@tanstack/react-router'
import { Menu, ArrowLeft } from 'lucide-react'
import { DkButton } from '@dk-ui/atoms/button'
import { DkLogo } from '@dk-ui/atoms/logo'
import { NavigationProvider, MenuDropdown, useNavigation, NavSearch } from '@navigation'
import { usePageMeta } from '@/lib/page-context'
import { UserMenu } from '@/features/auth/molecules/user-menu'
import { NotificationBell } from '@/features/notifications/molecules/notification-bell'
import { useNotificationToasts } from '@/features/notifications/use-notification-toasts'
import { XPToastContainer } from '@/features/dk-ui/atoms/xp-toast'
import { NowPlayingButton } from '@/features/spotify/now-playing-button'
import { NowPlayingView } from '@/features/spotify/now-playing-view'
import { TitleBar } from '@/features/title-bar/organisms/title-bar'

import { useDesktopPlatform } from '@/lib/desktop-platform'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import './app-layout.scss'

const PIN_KEY = 'otix_spotify_player_pinned'

function loadPinState(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === 'true'
  } catch {
    return false
  }
}

function MenuToggle() {
  const { toggle } = useNavigation()
  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="dk-nav-btn"
      aria-label="Toggle menu"
    >
      <Menu className="dk-nav-btn__icon" />
    </DkButton>
  )
}

function BackButton() {
  const router = useRouter()
  const canGoBack = typeof window !== "undefined" && window.history.length > 1

  if (!canGoBack) return null

  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={() => router.history.back()}
      className="dk-nav-btn"
      aria-label="Go back"
    >
      <ArrowLeft className="dk-nav-btn__icon" />
    </DkButton>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const { navLogo } = usePageMeta()
  const location = useLocation()
  const isPinned = loadPinState()
  const { isDesktop } = useDesktopPlatform()

  const isHomePage = location.pathname === '/'
  const canGoBack = typeof window !== "undefined" && window.history.length > 1
  const showBackButton = !isHomePage && canGoBack
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // On Electron, adjust floating pill positions to clear the title bar
  const titleBarOffset = isDesktop ? 'dk-floating-pill--offset-default' : 'dk-floating-pill--offset-default'

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev)
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false)
  }, [])

  useNotificationToasts()

  return (
    <div className="dk-app-shell">
      <TitleBar />

      {/* Left floating pill — hidden in game launcher (it has its own picker) */}
      {!location.pathname.startsWith('/games') && (
        <div
          className={cn('dk-floating-pill dk-floating-pill--left', titleBarOffset, navLogo && 'dk-floating-pill--left-w-logo')}
          data-menu-trigger
        >
          {showBackButton && <BackButton />}
          <MenuToggle />
          {navLogo ? (
            <img
              src={navLogo}
              alt=""
              className="dk-nav-logo-img"
            />
          ) : (
            <Link to="/" className="flex items-center pr-2">
              <DkLogo />
            </Link>
          )}
        </div>
      )}

      <MenuDropdown />
      {/* Right floating pill */}
      <div
        className={cn('dk-floating-pill dk-floating-pill--right', titleBarOffset)}
      >
        <NowPlayingButton
          bare
          isPinned={isPinned}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
        />
        <NavSearch />
        <NotificationBell bare />
        <UserMenu bare />
      </div>

      {/* Main content — top padding is structural to clear the floating pills; pages manage their own bottom/horizontal padding */}
      <div className={cn('dk-main-content', isDesktop && 'dk-main-content--desktop')}>
        <main className="dk-main-content__inner">{children}</main>
        <NowPlayingView open={isSidebarOpen} onClose={handleCloseSidebar} />
      </div>

      <XPToastContainer />
    </div>
  )
}

function DkAppLayout({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider>
      <AppShell>{children}</AppShell>
    </NavigationProvider>
  )
}

export { DkAppLayout, DkAppLayout as AppLayout }
