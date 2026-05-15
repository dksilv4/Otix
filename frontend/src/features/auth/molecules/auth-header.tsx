import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface AuthHeaderProps {
  title: string
  subtitle: string
  className?: string
  children?: ReactNode
}

export function AuthHeader({ title, subtitle, className, children }: AuthHeaderProps) {
  return (
    <div className={cn('mb-8 text-center', className)}>
      {children}
      <h2
        className="bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-[2rem] font-extrabold leading-tight tracking-[-0.03em] text-transparent sm:text-[2.5rem]"
        style={{
          backgroundImage: 'linear-gradient(135deg, var(--primary), oklch(0.546 0.245 262.881))',
        }}
      >
        {title}
      </h2>
      <p className="mt-2 text-base text-white/30">{subtitle}</p>
    </div>
  )
}
