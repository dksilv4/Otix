import { Link, useLocation } from "@tanstack/react-router"
import { useNavigation } from "@navigation/hooks/use-navigation"

const iconBg = "flex items-center justify-center w-9 h-9 rounded-full shrink-0 bg-[var(--dk-surface-ghost-active)]"

/** Atom navigation link with icon and label for the sidebar. */
export const NavLink = ({
  to,
  icon,
  label,
  params,
  badge,
}: {
  to: string
  icon: React.ReactNode
  label: string
  params?: Record<string, string>
  badge?: number | string
}) => {
  const location = useLocation()
  const { close } = useNavigation()

  const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)

  return (
    <Link
      to={to as string}
      params={params as Record<string, string> | undefined}
      onClick={() => close()}
      className={"flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 select-none " + (isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]")}
    >
      <span className={iconBg + (isActive ? " bg-primary/15 text-primary" : '')}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {Boolean(badge) && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground shadow-sm">
          {typeof badge === 'number' && badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
};
