import { useDesktopPlatform } from "@/lib/desktop/platform"
import { UserMenu } from "@auth"
import { ActivityModuleButton } from "@activity/components/atoms/nav-activity-button"
import { NavPill } from "../atoms/nav-pill"
import { NavSearch } from "./nav-search"

interface NavPillRightProps {
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

/** Right-side floating navigation pill containing search, user menu, and activity toggle. */
export function NavPillRight({ isPinned, isSidebarOpen, onToggleSidebar }: NavPillRightProps) {
  const { isDesktop } = useDesktopPlatform()
  const titleBarOffset = isDesktop ? "top-12" : "top-4"

  return (
    <NavPill className={`right-4 px-2 py-1.5 ${titleBarOffset}`}>
      <NavSearch />
      <UserMenu bare />
      <ActivityModuleButton bare isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
    </NavPill>
  )
}
