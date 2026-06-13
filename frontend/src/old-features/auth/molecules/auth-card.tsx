import type { ReactNode } from 'react'
import './auth-card.scss'

interface AuthCardProps {
  children: ReactNode
  className?: string
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div className={'dk-auth-card' + (className ? ' ' + className : '')}>
      {children}
    </div>
  )
}
