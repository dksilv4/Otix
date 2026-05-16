import { useEffect, useRef, useCallback } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import {
  HomeIcon,
  BookmarkIcon,
  BellIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@heroicons/react/24/solid"
import { useAuth } from "@/features/auth/auth-provider"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigation } from "@navigation/providers/navigation-provider"
import { cn } from "@/lib/utils"

const iconBg = cn(
  "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
  "bg-[var(--dk-surface-ghost-active)]",
)

function NavLink({ to, icon, label, params }: { to: string; icon: React.ReactNode; label: string; params?: Record<string, string> }) {
  const location = useLocation()
  const { close } = useNavigation()

  const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)

  return (
    <Link
      to={to as any}
      params={params as any}
      onClick={() => close()}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
        "transition-colors duration-150 select-none",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]",
      )}
    >
      <span className={cn(iconBg, isActive && "bg-primary/15 text-primary")}>
        {icon}
      </span>
      {label}
    </Link>
  )
}

export function MenuDropdown() {
  const { isOpen, close } = useNavigation()
  const { user } = useAuth()
  const ref = useRef<HTMLDivElement>(null)

  const links = [
    { to: "/", icon: <HomeIcon className="h-[18px] w-[18px]" />, label: "Home", params: undefined },
    { to: "/library", icon: <BookmarkIcon className="h-[18px] w-[18px]" />, label: "Library", params: undefined },
    ...(user ? [
      { to: "/u/$username" as string, icon: <UserCircleIcon className="h-[18px] w-[18px]" />, label: "Profile", params: { username: user.username } },
      { to: "/notifications" as string, icon: <BellIcon className="h-[18px] w-[18px]" />, label: "Notifications", params: undefined as any },
    ] : []),
    ...(user?.isAdmin ? [
      { to: "/admin" as string, icon: <ShieldCheckIcon className="h-[18px] w-[18px]" />, label: "Admin", params: undefined as any },
    ] : []),
    { to: "/settings", icon: <Cog6ToothIcon className="h-[18px] w-[18px]" />, label: "Settings", params: undefined },
  ]

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
            "fixed top-[4.5rem] left-4 z-[9998]",
            "w-[15rem] p-3 rounded-[1.5rem]",
            "bg-[var(--dk-surface-overlay)]",
            "backdrop-blur-xl",
            "shadow-[var(--dk-shadow-glass)]",
            "flex flex-col gap-0.5",
          )}
        >
          {links.map((link) => (
            <NavLink key={link.to} {...link} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
