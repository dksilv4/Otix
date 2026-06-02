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
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

const PIN_KEY = 'otix_spotify_player_pinned'

function loadPinState(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === 'true'
  } catch {
    return false
  }
}



const floatingPill = cn(
  'fixed z-[9999]',
  'flex items-center rounded-[2rem]',
  'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
  'backdrop-blur-lg',
  'shadow-[var(--dk-shadow-glass)]',
)

function MenuToggle() {
  const { toggle } = useNavigation()
  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
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
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </DkButton>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const { navLogo } = usePageMeta()
  const location = useLocation()
  const isPinned = loadPinState()

  const isHomePage = location.pathname === '/'
  const canGoBack = typeof window !== "undefined" && window.history.length > 1
  const showBackButton = !isHomePage && canGoBack
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)



  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev)
  }, [])

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false)
  }, [])

  useNotificationToasts()

  return (
    <div className="min-h-screen bg-background">
      <div
        className={cn(
          floatingPill,
          'top-4 left-4 px-2 py-1.5 gap-1 transition-all duration-300',
          navLogo && 'pr-4',
        )}
        data-menu-trigger
      >
        {showBackButton && <BackButton />}
        <MenuToggle />
        {navLogo ? (
          <img
            src={navLogo}
            alt=""
            className="h-7 max-w-[120px] object-contain"
          />
        ) : (
          <Link to="/" className="flex items-center pr-2">
            <DkLogo />
          </Link>
        )}
      </div>

      <MenuDropdown />
      <div
        className={cn(
          floatingPill,
          'top-4 right-4 px-2 py-1.5 gap-1 transition-all duration-300',
        )}
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

      <div className="flex min-h-screen">
        <main className="flex-1 container mx-auto px-4 pt-20 pb-24">{children}</main>
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
