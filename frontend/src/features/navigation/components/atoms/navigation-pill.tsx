import type { HTMLAttributes, ReactNode } from "react"

interface NavPillProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Atom glass-styled container for the floating navigation pill. */
export const NavPill = ({ children, className = "", style: _style, ...props }: NavPillProps) => {
  return (
    <div
      className={"fixed z-[9999] flex items-center rounded-[2rem] gap-1.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] " + className}
      style={{
        transition: "all 300ms var(--dk-ease-out)",
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
      }}
      {...props}
    >
      {children}
    </div>
  )
};
