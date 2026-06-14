import { useDesktopPlatform } from "@/lib/desktop-platform"
import { cn } from "@/lib/utils"
import { UserMenu } from "@auth"
import { NowPlayingButton } from "@navigation/components/atoms/nav-activity-button"
import { NavPill } from "../atoms/nav-pill"
import { NavSearch } from "./nav-search"

interface NavPillRightProps {
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export function NavPillRight({ isPinned, isSidebarOpen, onToggleSidebar }: NavPillRightProps) {
  const { isDesktop } = useDesktopPlatform()
  const titleBarOffset = isDesktop ? "top-12" : "top-4"

  return (
    <NavPill className={cn("right-4 px-2 py-1.5", titleBarOffset)}>
      <NavSearch />
      <UserMenu bare />
      <NowPlayingButton bare isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
    </NavPill>
  )
}
