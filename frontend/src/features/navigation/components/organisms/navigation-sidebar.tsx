import { useEffect, useRef, useCallback } from "react"
import { useLocation } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, Compass, Search, Gamepad2, Settings, List, Download, MessageSquare } from "lucide-react"
import { useNavigation } from "@navigation/hooks/use-navigation"
import { NavLink } from "@navigation/components/atoms/navigation-link"
import { useDesktopPlatform } from "@/lib/desktop/platform"
import { useChatUnreadCountQuery } from "@/features/chat"

/** Animated floating dropdown menu for app navigation, positioned based on screen and route. */
export const MenuDropdown = () => {
  const { isOpen, close } = useNavigation()
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const { isDesktop } = useDesktopPlatform()
  const { data: chatUnreadData } = useChatUnreadCountQuery()
  const chatUnreadCount = chatUnreadData?.count ?? 0

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
          id="navigation-menu-dropdown"
          ref={ref}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          className={"fixed z-[9998] rounded-2xl bg-[var(--dk-surface-overlay)] border border-[var(--dk-separator)] shadow-[var(--dk-shadow-dialog)] backdrop-blur-2xl " + (isDesktop ? "top-[100px]" : "top-[4.5rem]") + " " + (location.pathname.startsWith("/game") || location.pathname.startsWith("/launcher") ? "left-[6rem]" : "left-4") + " w-[15rem] p-3 flex flex-col gap-0.5"}
        >
          <NavLink to="/" icon={<Compass className="h-4 w-4" />} label="Discover" />
          <NavLink to="/search" icon={<Search className="h-4 w-4" />} label="Search" />
          <NavLink to="/calendar" icon={<Calendar className="h-4 w-4" />} label="Calendar" />
          <NavLink to="/launcher" icon={<Gamepad2 className="h-4 w-4" />} label="Launcher" />
          <NavLink to="/library" icon={<List className="h-4 w-4" />} label="Library" />
          <NavLink to="/messages" icon={<MessageSquare className="h-4 w-4" />} label="Messages" badge={chatUnreadCount} />
          <NavLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
          <NavLink to="/downloads" icon={<Download className="h-4 w-4" />} label="Downloads" />
        </motion.div>
      )}
    </AnimatePresence>
  )
};
