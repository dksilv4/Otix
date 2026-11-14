import { useEffect, useState, useRef, useCallback } from "react"
import { X, ChevronUp } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion"
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
  const clusterRef = useRef<HTMLDivElement>(null)

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

  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const isDropdownExpanded = isUserMenuOpen || isSidebarOpen || isChatOpen
  const isPillExpanded = isDropdownExpanded || isSearchOpen

  // Retain the active panel during the exit animation so content stays rendered during dismiss
  const activePanel = isChatOpen ? 'chat' : isUserMenuOpen ? 'user' : isSidebarOpen ? 'activity' : null
  const [renderedPanel, setRenderedPanel] = useState<'chat' | 'user' | 'activity' | null>(null)

  useEffect(() => {
    if (activePanel) {
      setRenderedPanel(activePanel)
    }
  }, [activePanel])

  const displayedPanel = activePanel ?? renderedPanel

  // Collapse only dropdown panels (e.g. when clicking collapse chevron button)
  const handleCollapseDropdown = useCallback(() => {
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

  // Collapse all (click outside or escape)
  const handleCollapseAll = useCallback(() => {
    setIsSearchOpen(false)
    handleCollapseDropdown()
  }, [handleCollapseDropdown])

  // Click outside to collapse the unified right nav when expanded
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Do not collapse if clicking inside a modal dialog or select popup
      if (target.closest('[role="dialog"]') || target.closest('[data-modal-portal]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        handleCollapseAll()
      }
    },
    [handleCollapseAll],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPillExpanded) {
        handleCollapseAll()
      }
    },
    [isPillExpanded, handleCollapseAll],
  )

  useEffect(() => {
    if (!isPillExpanded) return
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isPillExpanded, handleClickOutside, handleKeyDown])

  const shouldReduceMotion = useReducedMotion()
  const transition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: isPillExpanded ? 0.2 : 0.16, ease: [0.16, 1, 0.3, 1] }

  const baseCompactWidth = showCloseButton ? 200 : 162

  const targetWidth = isSearchOpen
    ? (showCloseButton ? 540 : 500)
    : isDropdownExpanded
    ? (showCloseButton ? 416 : 380)
    : baseCompactWidth

  return (
    <motion.div
      ref={containerRef}
      animate={{
        width: targetWidth,
      }}
      transition={transition}
      data-nav-pill="right"
      className={`fixed z-[9999] right-4 ${titleBarOffset} rounded-3xl shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] border border-white/[0.04] flex flex-col p-2 ${
        isSearchOpen ? "overflow-visible" : "overflow-hidden"
      } transform-gpu`}
      style={{
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
    >
      {/* Top Controls Bar Row */}
      <div
        ref={clusterRef}
        className="flex items-center justify-end w-full h-8 gap-1.5 overflow-visible"
      >
        {/* Collapse button when dropdown is expanded */}
        <AnimatePresence initial={false}>
          {isDropdownExpanded && (
            <motion.button
              key="collapse-button"
              initial={{ opacity: 0, width: 0, scale: 0.9 }}
              animate={{ opacity: 1, width: 32, scale: 1 }}
              exit={{ opacity: 0, width: 0, scale: 0.9 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      width: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.12, ease: "easeOut" },
                      scale: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                    }
              }
              style={{ transformOrigin: "left center" }}
              type="button"
              onClick={handleCollapseDropdown}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground active:scale-[0.94] transition-colors duration-100 cursor-pointer shrink-0 overflow-hidden"
              title="Collapse menu"
              aria-label="Collapse menu"
            >
              <ChevronUp className="h-4 w-4 shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>

        {showCloseButton && (
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={closeAll}
            className="w-8 h-8 rounded-full p-0 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </DkButton>
        )}

        {/* Spacer when dropdown is open but search is CLOSED: pushes right icons to right edge */}
        {isDropdownExpanded && !isSearchOpen && <div className="flex-1 min-w-0" />}

        {/* Search Bar: flex-1 when open, shrink-0 icon button when closed */}
        <div
          className={
            isSearchOpen
              ? "flex-1 min-w-0 flex items-center overflow-visible"
              : "flex items-center shrink-0 overflow-visible"
          }
        >
          <NavSearch
            isOpen={isSearchOpen}
            onOpenChange={(next) => {
              setIsSearchOpen(next)
            }}
          />
        </div>

        {/* Right action icons cluster */}
        <div className="flex items-center gap-1.5 shrink-0 overflow-visible">
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

      {/* Dropdown Content appears smoothly without layout scale or text reflow */}
      <AnimatePresence initial={false} onExitComplete={() => setRenderedPanel(null)}>
        {isDropdownExpanded && (
          <motion.div
            key="nav-right-dropdown-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    height: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
                    opacity: { duration: 0.12, ease: "easeOut" },
                  }
            }
            className="w-full overflow-hidden rounded-b-2xl"
          >
            {/* Top divider separating nav controls from panel content with balanced spacing */}
            <div className="w-full pt-2 pb-2.5">
              <div className="w-full border-t border-[var(--dk-separator)]" />
            </div>

            {/* Panel content scroll container */}
            <div className="w-full max-h-[calc(100vh-6.5rem)] overflow-y-auto scrollbar-none flex flex-col pb-1">
              {displayedPanel === 'chat' && <ChatNavPanelContent onClose={handleCollapseAll} />}
              {displayedPanel === 'user' && <UserMenuContent onClose={handleCollapseAll} />}
              {displayedPanel === 'activity' && <ActivityPanelContent onClose={handleCollapseAll} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
};
