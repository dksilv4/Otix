import { X } from "lucide-react"
import { DkButton } from "@ui/atoms/button"
import { useModal } from "@/lib/modals"
import { useDesktopPlatform } from "@/lib/desktop/platform"
import { UserMenu } from "@auth"
import { ActivityModuleButton } from "@activity/components/atoms/activity-nav-button"
import { NavPill } from "../atoms/navigation-pill"
import { NavSearch } from "./navigation-search"

interface NavPillRightProps {
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

/** Right-side floating navigation pill containing search, user menu, and activity toggle. */
export function NavPillRight({ isPinned, isSidebarOpen, onToggleSidebar }: NavPillRightProps) {
  const { isDesktop } = useDesktopPlatform()
  const titleBarOffset = isDesktop ? "top-12" : "top-4"
  const { modals, closeAll } = useModal()

  const showCloseButton = modals.length > 0

  return (
    <NavPill className={`right-4 px-2 py-1.5 ${titleBarOffset}`}>
      {showCloseButton && (
        <DkButton
          variant="ghost"
          size="sm"
          onClick={closeAll}
          className="w-8 h-8 rounded-full p-0 flex items-center justify-center text-white/70 hover:text-white mr-1.5"
          aria-label="Close"
        >
          <X className="h-4.5 w-4.5" />
        </DkButton>
      )}
      <NavSearch />
      <UserMenu bare />
      <ActivityModuleButton bare isPinned={isPinned} isSidebarOpen={isSidebarOpen} onToggleSidebar={onToggleSidebar} />
    </NavPill>
  )
}
