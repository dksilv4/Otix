import { useEffect, useRef, useCallback } from "react"
import { useLocation } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import { Compass, Search } from "lucide-react"
import { useNavigation } from "@navigation/hooks/use-navigation"
import { NavLink } from "@navigation/components/atoms/nav-link"
import { cn } from "@/lib/utils"
import { useDesktopPlatform } from "@/lib/desktop/platform"

/** Animated floating dropdown menu for app navigation, positioned based on screen and route. */
export function MenuDropdown() {
  const { isOpen, close } = useNavigation()
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const { isDesktop } = useDesktopPlatform()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    },
    [close],
  )

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("[data-menu-trigger]")) return
      if (ref.current && !ref.current.contains(target)) {
        close()
      }
    },
    [close],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, handleKeyDown, handleClickOutside])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "fixed z-[9998] dk-surface",
            isDesktop ? "top-[100px]" : "top-[4.5rem]",
            location.pathname.startsWith("/game") ? "left-[6rem]" : "left-4",
            "w-[15rem] p-3 flex flex-col gap-0.5",
          )}
        >
          <NavLink to="/" icon={<Compass className="h-4 w-4" />} label="Discover" />
          <NavLink to="/search" icon={<Search className="h-4 w-4" />} label="Search" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
