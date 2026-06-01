import { useState, useCallback } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Menu, ArrowLeft } from 'lucide-react'
import { DkButton } from '@dk-ui/atoms/button'
import { DkLogo } from '@dk-ui/atoms/logo'
import { NavigationProvider, MenuDropdown, useNavigation, NavSearch } from '@navigation'
import { usePageMeta } from '@/lib/page-context'
import { UserMenu } from '@/features/auth/molecules/user-menu'
import { NotificationBell } from '@/features/notifications/molecules/notification-bell'
import { useNotificationToasts } from '@/features/notifications/use-notification-toasts'
import { XPToastContainer } from '@/features/dk-ui/atoms/xp-toast'
import { PlayerBar } from '@/features/spotify/player-bar'
import { NowPlayingButton } from '@/features/spotify/now-playing-button'
import { NowPlayingView } from '@/features/spotify/now-playing-view'
import { GameIndicator } from '@/features/game-detector/game-indicator'
import { GameMatcher } from '@/features/game-detector/game-matcher'
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

function savePinState(pinned: boolean) {
  try {
    localStorage.setItem(PIN_KEY, String(pinned))
  } catch {
    // localStorage not available
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
      size="icon"
      onClick={toggle}
      className="rounded-full"
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
      size="icon"
      onClick={() => router.history.back()}
      className="rounded-full"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </DkButton>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const { navLogo } = usePageMeta()
  const [isPinned, setIsPinned] = useState(() => loadPinState())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMatcherOpen, setIsMatcherOpen] = useState(false)

  const handlePin = useCallback(() => {
    setIsPinned(true)
    savePinState(true)
  }, [])

  const handleUnpin = useCallback(() => {
    setIsPinned(false)
    savePinState(false)
  }, [])

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
        <MenuToggle />
        <BackButton />
        <div className="w-px h-6 bg-white/[0.08]" />
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
      <div className="fixed top-4 right-4 z-[9998] flex items-center gap-2">
        <NowPlayingButton
          isPinned={isPinned}
          isSidebarOpen={isSidebarOpen}
          onPin={handlePin}
          onToggleSidebar={handleToggleSidebar}
        />
        <NavSearch />
        <div
          className={cn(
            'flex items-center rounded-[2rem]',
            'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
            'backdrop-blur-lg',
            'shadow-[var(--dk-shadow-glass)]',
            'px-2 py-1.5 gap-1',
          )}
        >
          <NotificationBell bare />
          <UserMenu bare />
        </div>
      </div>

      <div className="flex min-h-screen">
        <main className="flex-1 container mx-auto px-4 pt-20 pb-6">{children}</main>
        <NowPlayingView open={isSidebarOpen} onClose={handleCloseSidebar} />
      </div>

      <GameIndicator onOpenMatcher={() => setIsMatcherOpen(true)} />
      <GameMatcher isOpen={isMatcherOpen} onClose={() => setIsMatcherOpen(false)} />
      <PlayerBar
        isPinned={isPinned}
        onPin={handlePin}
        onUnpin={handleUnpin}
      />
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
