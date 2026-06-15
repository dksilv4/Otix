import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface NavPillProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Atom glass-styled container for the floating navigation pill. */
export function NavPill({ children, className, style: _style, ...props }: NavPillProps) {
  return (
    <div
      className={cn(
        "fixed z-[9999] flex items-center rounded-[2rem] gap-1.5",
        "shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px]",
        className,
      )}
      style={{
        transition: "all 300ms var(--dk-ease-out)",
        background: "oklch(from var(--dk-surface-raised) r g b / 0.25)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
      {...props}
    >
      {children}
    </div>
  )
}
