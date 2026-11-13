import { useEffect, useRef, useCallback } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import { DkLogo } from "@ui/atoms/logo"
import { usePageMeta } from "@/lib/providers/page-context"
import { useDesktopPlatform } from "@/lib/desktop/platform"
import { useNavigation } from "@navigation/hooks/use-navigation"
import { BackButton } from "../atoms/navigation-back-button"
import { MenuToggle } from "../atoms/navigation-menu-toggle"
import { MenuDropdownContent } from "../organisms/navigation-sidebar"

/**
 * Left-side floating navigation island.
 * Seamlessly morphs between compact navigation pill (back button, menu toggle, logo)
 * and expanded navigation dropdown with dynamic, smooth container resize animations
 * while keeping internal child components stable without child-level layout distortion.
 */
export const NavPillLeft = () => {
  const { navLogo } = usePageMeta()
  const location = useLocation()
  const { isDesktop } = useDesktopPlatform()
  const { isOpen, close } = useNavigation()
  const containerRef = useRef<HTMLDivElement>(null)

  const titleBarOffset = isDesktop ? "top-12" : "top-4"
  const isHomePage = location.pathname === "/"
  const showBackButton = !isHomePage

  // Click outside to collapse the left nav dropdown when open
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Do not collapse if clicking inside a modal dialog or portal
      if (target.closest('[role="dialog"]') || target.closest('[data-modal-portal]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        close()
      }
    },
    [close],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        close()
      }
    },
    [isOpen, close],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, handleClickOutside, handleKeyDown])

  return (
    <motion.div
      ref={containerRef}
      animate={{
        width: isOpen ? 240 : "auto",
        borderRadius: isOpen ? 24 : 32,
      }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      data-nav-pill="left"
      data-menu-trigger
      className={`fixed z-[9999] left-3 ${titleBarOffset} shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] overflow-hidden flex flex-col ${
        isOpen ? "p-3 gap-2" : "px-2 py-1.5 gap-0"
      }`}
      style={{
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
    >
      {/* Top Controls Bar Row */}
      <div className={`flex items-center w-full ${isOpen ? "justify-between" : "gap-1.5"}`}>
        <div className="flex items-center gap-1.5">
          <AnimatePresence initial={false}>
            {showBackButton && (
              <motion.div
                key="back-button-wrapper"
                initial={{ opacity: 0, width: 0, scale: 0.8 }}
                animate={{ opacity: 1, width: "auto", scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center overflow-hidden shrink-0"
              >
                <BackButton />
              </motion.div>
            )}
          </AnimatePresence>
          <MenuToggle />
        </div>

        <div className="flex items-center pr-1">
          {navLogo ? (
            <img src={navLogo} alt="" className="h-7 object-contain max-w-[120px] pr-2" />
          ) : (
            <Link to="/" aria-label="Otix Home" className="flex items-center pr-1">
              <DkLogo animateInfinity={false} />
            </Link>
          )}
        </div>
      </div>

      {/* Dropdown Content appears smoothly in a clean height/opacity transition without scale distortion */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="nav-left-dropdown-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full flex flex-col gap-0.5 pt-1.5 border-t border-[var(--dk-separator)]">
              <MenuDropdownContent />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
};
