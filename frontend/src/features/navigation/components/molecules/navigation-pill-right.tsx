import { useEffect, useState } from "react"
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

  // Delay the close control so the opening click / gesture cannot land on it
  // the instant a modal mounts (nav sits above --dk-z-modal).
  const [showCloseButton, setShowCloseButton] = useState(false)
  useEffect(() => {
    if (modals.length === 0) {
      setShowCloseButton(false)
      return
    }
    const timer = window.setTimeout(() => setShowCloseButton(true), 350)
    return () => window.clearTimeout(timer)
  }, [modals.length])

  return (
    <NavPill className={`right-4 px-2 py-1.5 ${titleBarOffset}`} data-nav-pill="right">
      {showCloseButton && (
        <DkButton
          type="button"
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
