import { useEffect, useState, useRef, useCallback } from "react"
import { X, ChevronUp } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { DkButton } from "@ui/atoms/button"
import { useModal } from "@/lib/modals"
import { useDesktopPlatform } from "@/lib/desktop/platform"
import { UserMenu, UserMenuContent } from "@auth"
import { ActivityModuleButton } from "@activity/components/atoms/activity-nav-button"
import { ActivityPanelContent } from "@activity/components/organisms/activity-panel"
import { usePanelContext } from "@activity/providers/panel-context"
import { ChatNavButton, ChatNavPanelContent } from "@/features/chat"
import { NavSearch } from "./navigation-search"

interface NavPillRightProps {
  isPinned: boolean
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onCloseSidebar?: () => void
}

/**
 * Right-side floating navigation island.
 * Seamlessly morphs between compact navigation pill and expanded dropdowns
 * (user profile/friends, chat messages, and activity panel) with shared layout animations,
 * and unified collapse mechanics.
 */
export const NavPillRight = ({
  isPinned,
  isSidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
}: NavPillRightProps) => {
  const { isDesktop } = useDesktopPlatform()
  const titleBarOffset = isDesktop ? "top-12" : "top-4"
  const { modals, closeAll } = useModal()
  const { isUserMenuOpen, setUserMenuOpen, isChatOpen, setChatOpen } = usePanelContext()
  const containerRef = useRef<HTMLDivElement>(null)

  const isExpanded = isUserMenuOpen || isSidebarOpen || isChatOpen

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

  const handleCollapse = useCallback(() => {
    if (isUserMenuOpen) setUserMenuOpen(false)
    if (isChatOpen) setChatOpen(false)
    if (isSidebarOpen) {
      if (onCloseSidebar) {
        onCloseSidebar()
      } else {
        onToggleSidebar()
      }
    }
  }, [isUserMenuOpen, setUserMenuOpen, isChatOpen, setChatOpen, isSidebarOpen, onCloseSidebar, onToggleSidebar])

  // Click outside to collapse the unified right nav when expanded
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Do not collapse if clicking inside a modal dialog or select popup
      if (target.closest('[role="dialog"]') || target.closest('[data-modal-portal]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        handleCollapse()
      }
    },
    [handleCollapse],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded) {
        handleCollapse()
      }
    },
    [isExpanded, handleCollapse],
  )

  useEffect(() => {
    if (!isExpanded) return
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isExpanded, handleClickOutside, handleKeyDown])

  return (
    <motion.div
      ref={containerRef}
      animate={{
        width: isExpanded ? 380 : "auto",
        borderRadius: isExpanded ? 24 : 32,
      }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      data-nav-pill="right"
      className={`fixed z-[9999] right-4 ${titleBarOffset} shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] flex flex-col overflow-hidden ${
        isExpanded ? "p-3 gap-2" : "px-2 py-1.5 gap-0"
      }`}
      style={{
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
    >
      {/* Top Controls Bar Row */}
      <div className="flex items-center justify-end w-full overflow-visible">
        {/* Collapse button when open */}
        <AnimatePresence>
          {isExpanded && (
            <motion.button
              key="collapse-button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              type="button"
              onClick={handleCollapse}
              className="mr-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors cursor-pointer shrink-0"
              title="Collapse menu"
              aria-label="Collapse menu"
            >
              <ChevronUp className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1.5 overflow-visible">
          {showCloseButton && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeAll}
              className="w-8 h-8 rounded-full p-0 flex items-center justify-center text-muted-foreground hover:text-foreground mr-1"
              aria-label="Close"
            >
              <X className="h-4.5 w-4.5" />
            </DkButton>
          )}

          {/* Search Button */}
          <div className="flex items-center overflow-visible">
            <NavSearch />
          </div>

          {/* Chat Messages Button */}
          <div className="flex items-center overflow-visible">
            <ChatNavButton
              onToggleChat={() => {
                if (isUserMenuOpen) setUserMenuOpen(false)
                if (isSidebarOpen) {
                  if (onCloseSidebar) onCloseSidebar()
                  else onToggleSidebar()
                }
                setChatOpen(!isChatOpen)
              }}
            />
          </div>

          {/* User Profile / Menu Trigger */}
          <div className="flex items-center overflow-visible">
            <UserMenu
              bare
              triggerOnly
              onToggle={(next) => {
                if (next) {
                  if (isChatOpen) setChatOpen(false)
                  if (isSidebarOpen) {
                    if (onCloseSidebar) onCloseSidebar()
                    else onToggleSidebar()
                  }
                }
              }}
            />
          </div>

          {/* Activity Module Toggle Button */}
          <div className="flex items-center overflow-visible">
            <ActivityModuleButton
              bare
              isPinned={isPinned}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => {
                if (isUserMenuOpen) setUserMenuOpen(false)
                if (isChatOpen) setChatOpen(false)
                onToggleSidebar()
              }}
            />
          </div>
        </div>
      </div>

      {/* Dropdown Content appears smoothly without layout scale distortion */}
      <AnimatePresence mode="wait">
        {isChatOpen && (
          <motion.div
            key="chat-dropdown-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full flex flex-col pt-1.5 border-t border-[var(--dk-separator)]">
              <ChatNavPanelContent onClose={handleCollapse} />
            </div>
          </motion.div>
        )}

        {isUserMenuOpen && (
          <motion.div
            key="user-menu-dropdown-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-none flex flex-col space-y-2 pt-1.5 border-t border-[var(--dk-separator)]">
              <UserMenuContent onClose={handleCollapse} />
            </div>
          </motion.div>
        )}

        {isSidebarOpen && (
          <motion.div
            key="activity-dropdown-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-none flex flex-col space-y-2 pt-1.5 border-t border-[var(--dk-separator)]">
              <ActivityPanelContent onClose={handleCollapse} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
};
