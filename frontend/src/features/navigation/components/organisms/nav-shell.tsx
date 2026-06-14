import type { ReactNode } from "react"
import { useLocation } from "@tanstack/react-router"
import { NavigationProvider } from "@navigation/providers/navigation-provider"
import { NavPillLeft } from "../molecules/nav-pill-left"
import { NavPillRight } from "../molecules/nav-pill-right"
import { MenuDropdown } from "./nav-sidebar"

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
      {!location.pathname.startsWith("/game") && <NavPillLeft />}
      <MenuDropdown />
      <NavPillRight isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
      {children}
    </>
  )
}

export function NavShell({ children, isPinned, isSidebarOpen, onToggleSidebar }: NavShellProps) {
  return (
    <NavigationProvider>
      <NavShellInner isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar}>
        {children}
      </NavShellInner>
    </NavigationProvider>
  )
}
