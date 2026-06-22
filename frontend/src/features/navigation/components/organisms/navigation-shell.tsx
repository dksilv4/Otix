import type { ReactNode } from "react"
import { useLocation } from "@tanstack/react-router"
import { NavigationProvider } from "@navigation/providers/navigation-provider"
import { NavPillLeft } from "../molecules/navigation-pill-left"
import { NavPillRight } from "../molecules/navigation-pill-right"
import { MenuDropdown } from "./navigation-sidebar"

interface NavShellProps {
  children: ReactNode
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

function NavShellInner({ children, isPinned, isSidebarOpen, onToggleSidebar }: NavShellProps) {
  const location = useLocation()

  return (
    <>
      {!location.pathname.startsWith("/game") && !location.pathname.startsWith("/launcher") && <NavPillLeft />}
      <MenuDropdown />
      <NavPillRight isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
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
