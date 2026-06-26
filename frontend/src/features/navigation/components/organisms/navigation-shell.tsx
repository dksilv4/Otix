import type { ReactNode } from "react"
import { useLocation } from "@tanstack/react-router"
import { NavigationProvider } from "@navigation/providers/navigation-provider"
import { NavPillLeft } from "../molecules/navigation-pill-left"
import { NavPillRight } from "../molecules/navigation-pill-right"
import { NavPill } from "../atoms/navigation-pill"
import { NavSearch } from "../molecules/navigation-search"
import { MenuToggle } from "../atoms/navigation-menu-toggle"
import { MenuDropdown } from "./navigation-sidebar"

interface NavShellProps {
  children: ReactNode
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

function getLauncherNavPosition(): 'top' | 'left' {
  try {
    const themeId = localStorage.getItem('otix-launcher-theme')
    if (themeId === 'retro') return 'top'
    return 'left'
  } catch {
    return 'left'
  }
}

function NavShellInner({ children, isPinned, isSidebarOpen, onToggleSidebar }: NavShellProps) {
  const location = useLocation()
  const isLauncherRoute = location.pathname.startsWith("/launcher") || location.pathname.startsWith("/game")
  const navPosition = isLauncherRoute ? getLauncherNavPosition() : 'left'
  const showTopNav = isLauncherRoute && navPosition === 'top'

  return (
    <>
      {!isLauncherRoute && <NavPillLeft />}
      <MenuDropdown />
      {!isLauncherRoute && (
        <NavPillRight isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
      )}
      {showTopNav && (
        <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pt-2">
          <NavPill className="px-3 py-1.5">
            <MenuToggle />
            <NavSearch />
          </NavPill>
        </div>
      )}
      {children}
    </>
  )
}

/** Top-level navigation layout wrapper providing pill navigation, sidebar, and routing context. */
export function NavShell({ children, isPinned, isSidebarOpen, onToggleSidebar }: NavShellProps) {
  return (
    <NavigationProvider>
      <NavShellInner isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar}>
        {children}
      </NavShellInner>
    </NavigationProvider>
  )
}
