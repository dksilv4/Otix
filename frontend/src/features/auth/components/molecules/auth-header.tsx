import type { ReactNode } from 'react'

interface AuthHeaderProps {
  title: string
  subtitle: string
  className?: string
  children?: ReactNode
}

export const AuthHeader = ({ title, subtitle, className, children }: AuthHeaderProps) => (
  <div className={'mb-8 text-center' + (className ? ' ' + className : '')}>
    {children}
    <h2 className="bg-gradient-to-r from-primary via-primary to-accent-foreground bg-clip-text text-[2rem] font-extrabold leading-tight tracking-[-0.03em] text-transparent sm:text-[2.5rem]">
      {title}
    </h2>
    <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
  </div>
)
