import { useEffect, useRef, useCallback, useState } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion"
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

  const [compactWidth, setCompactWidth] = useState<number>(showBackButton ? 138 : 108)
  const [isRestingClosed, setIsRestingClosed] = useState(true)

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

  // Measure compact width strictly when closed and idle
  useEffect(() => {
    if (!isOpen && isRestingClosed && containerRef.current) {
      const measured = containerRef.current.offsetWidth
      if (measured >= 80 && measured <= 180) {
        setCompactWidth(measured)
      }
    }
  }, [isOpen, isRestingClosed, showBackButton, navLogo])

  // When isOpen changes, exit resting closed state so numeric width transition triggers
  useEffect(() => {
    if (isOpen) {
      setIsRestingClosed(false)
    }
  }, [isOpen])

  const shouldReduceMotion = useReducedMotion()
  const transition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : isRestingClosed
    ? { duration: 0 }
    : { duration: isOpen ? 0.2 : 0.16, ease: [0.16, 1, 0.3, 1] }

  const targetWidth = isOpen ? 240 : isRestingClosed ? "auto" : compactWidth

  return (
    <motion.div
      ref={containerRef}
      animate={{
        width: targetWidth,
      }}
      transition={transition}
      onAnimationComplete={() => {
        if (!isOpen) {
          setIsRestingClosed(true)
        }
      }}
      data-nav-pill="left"
      data-menu-trigger
      className={`fixed z-[9999] left-3 ${titleBarOffset} rounded-3xl shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] border border-white/[0.04] overflow-hidden flex flex-col p-2 transform-gpu`}
      style={{
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
    >
      {/* Top Controls Bar Row */}
      <div className="flex items-center justify-between w-full h-8 gap-2">
        <div className="flex items-center gap-1.5">
          <AnimatePresence initial={false}>
            {showBackButton && (
              <motion.div
                key="back-button-wrapper"
                initial={{ opacity: 0, width: 0, scale: 0.94 }}
                animate={{ opacity: 1, width: "auto", scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.94 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "left center" }}
                className="flex items-center overflow-hidden shrink-0"
              >
                <BackButton />
              </motion.div>
            )}
          </AnimatePresence>
          <MenuToggle />
        </div>

        <div className="flex items-center shrink-0">
          {navLogo ? (
            <img src={navLogo} alt="" className="h-7 object-contain max-w-[120px]" />
          ) : (
            <Link to="/" aria-label="Otix Home" className="flex items-center">
              <DkLogo animateInfinity={false} />
            </Link>
          )}
        </div>
      </div>

      {/* Dropdown Content appears smoothly in a clean height/opacity transition without scale or text reflow */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="nav-left-dropdown-content"
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
            className="w-full overflow-hidden"
          >
            {/* Top divider separating nav controls from menu content with balanced spacing */}
            <div className="w-[224px] min-w-[224px] pt-2 pb-2">
              <div className="w-full border-t border-[var(--dk-separator)]" />
            </div>

            <div className="w-[224px] min-w-[224px] flex flex-col gap-0.5 pb-1">
              <MenuDropdownContent />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
};
