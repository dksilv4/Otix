import { Link, useLocation } from "@tanstack/react-router"
import { useNavigation } from "@navigation/hooks/use-navigation"
import { cn } from "@/lib/utils"

const iconBg = cn(
  "flex items-center justify-center w-9 h-9 rounded-full shrink-0",
  "bg-[var(--dk-surface-ghost-active)]",
)

/** Atom navigation link with icon and label for the sidebar. */
export function NavLink({ to, icon, label, params }: { to: string; icon: React.ReactNode; label: string; params?: Record<string, string> }) {
  const location = useLocation()
  const { close } = useNavigation()

  const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)

  return (
    <Link
      to={to as string}
      params={params as Record<string, string> | undefined}
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
