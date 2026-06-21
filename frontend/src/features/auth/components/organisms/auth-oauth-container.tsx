import type { ReactNode } from 'react'

/** Glassmorphism container for grouping OAuth provider buttons. */
export function OAuthContainer({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return (
    <div
      id={id}
      className="w-full max-w-sm rounded-[2rem] p-6 text-center [&:has(>div:empty)]:hidden"
      style={{
        backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.4)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: 'var(--dk-shadow-glass)',
      }}
    >
      <p className="mb-4 text-xs text-muted-foreground">or continue with</p>
      <div className="flex justify-center gap-3">{children}</div>
    </div>
  )
}
