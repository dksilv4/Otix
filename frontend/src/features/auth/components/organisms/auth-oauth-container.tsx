import type { ReactNode } from 'react'

/** Glassmorphism container for grouping OAuth provider buttons. */
export const OAuthContainer = ({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) => {
  return (
    <div
      id={id}
      className="w-full max-w-sm rounded-[2rem] p-6 text-center [&:has(>div:empty)]:hidden bg-[var(--dk-surface-base)]/40 backdrop-blur-2xl"
      style={{
        boxShadow: 'var(--dk-shadow-glass)',
      }}
    >
      <p className="mb-4 text-xs text-muted-foreground">or continue with</p>
      <div className="flex justify-center gap-3">{children}</div>
    </div>
  )
};
