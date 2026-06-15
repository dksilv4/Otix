import type { ReactNode } from 'react'

interface AuthCardProps {
  children: ReactNode
  className?: string
}

/** Glass-morphism card container for auth form content. (molecule) */
export const AuthCard = ({ children, className }: AuthCardProps) => (
  <div
    className={'relative w-full max-w-sm rounded-[2rem] p-8 text-center' + (className ? ' ' + className : '')}
    style={{
      backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.4)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow: 'var(--dk-shadow-glass)',
    }}
  >
    {children}
  </div>
)
