import { Link } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Button } from '@ui/atoms/button'
import { Logo } from '@ui/atoms/logo'
import { NavigationProvider, MenuDropdown, useNavigation } from '@navigation'
import { usePageMeta } from '@/lib/page-context'
import { UserMenu } from '@/features/auth/molecules/user-menu'
import { NotificationBell } from '@/features/notifications/molecules/notification-bell'
import { XPToastContainer } from '@/features/dk-ui/atoms/xp-toast'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

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
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="rounded-full"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
    </Button>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const { navLogo } = usePageMeta()

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
        {navLogo ? (
          <img
            src={navLogo}
            alt=""
            className="h-7 max-w-[120px] object-contain"
          />
        ) : (
          <Link to="/" className="flex items-center pr-2">
            <Logo />
          </Link>
        )}
      </div>

      <MenuDropdown />
      <NotificationBell />
      <UserMenu />

      <main className="flex-1 container mx-auto px-4 pt-20 pb-6">{children}</main>
      <XPToastContainer />
    </div>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider>
      <AppShell>{children}</AppShell>
    </NavigationProvider>
  )
}
