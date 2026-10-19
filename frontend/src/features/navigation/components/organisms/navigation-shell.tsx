import type { ReactNode } from "react"
import { NavigationProvider } from "@navigation/providers/navigation-provider"
import { NavPillLeft } from "../molecules/navigation-pill-left"
import { NavPillRight } from "../molecules/navigation-pill-right"
import { MenuDropdown } from "./navigation-sidebar"

import { useNavPillsVisibility } from "../../hooks/use-nav-pills-visibility"

interface NavShellProps {
  children: ReactNode
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onCloseSidebar?: () => void
}

const NavShellInner = ({
  children,
  isPinned,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
}: NavShellProps) => {
  const { showLeft, showRight } = useNavPillsVisibility()

  return (
    <>
      {showLeft && <NavPillLeft />}
      {showLeft && <MenuDropdown />}
      {showRight && (
        <NavPillRight
          isPinned={isPinned}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={onToggleSidebar}
          onCloseSidebar={onCloseSidebar}
        />
      )}
      {children}
    </>
  )
};

/** Top-level navigation layout wrapper providing pill navigation, sidebar, and routing context. */
export const NavShell = ({
  children,
  isPinned,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
}: NavShellProps) => {
  return (
    <NavigationProvider>
      <NavShellInner
        isPinned={isPinned}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onCloseSidebar={onCloseSidebar}
      >
        {children}
      </NavShellInner>
    </NavigationProvider>
  )
};
