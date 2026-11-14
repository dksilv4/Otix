import type { HTMLAttributes, ReactNode } from "react"

interface NavPillProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Atom glass-styled container for the floating navigation pill. */
export const NavPill = ({ children, className = "", style: customStyle, ...props }: NavPillProps) => {
  return (
    <div
      className={"fixed z-[9999] flex items-center rounded-[2rem] p-2 gap-1.5 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px] border border-white/[0.04] transform-gpu " + className}
      style={{
        transition: "transform 200ms var(--dk-ease-out), opacity 150ms var(--dk-ease-out)",
        background: "color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)",
        backgroundImage:
          "linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))",
        ...customStyle,
      }}
      {...props}
    >
      {children}
    </div>
  )
};
