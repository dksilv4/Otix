import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import './auth-header.scss'

interface AuthHeaderProps {
  title: string
  subtitle: string
  className?: string
  children?: ReactNode
}

export function AuthHeader({ title, subtitle, className, children }: AuthHeaderProps) {
  return (
    <div className={cn('dk-auth-header', className)}>
      {children}
      <h2
        className="dk-auth-header__title"
        style={{
          backgroundImage: 'linear-gradient(135deg, var(--primary), oklch(0.546 0.245 262.881))',
        }}
      >
        {title}
      </h2>
      <p className="dk-auth-header__subtitle">{subtitle}</p>
    </div>
  )
}
