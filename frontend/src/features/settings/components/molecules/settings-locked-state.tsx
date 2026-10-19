import type { ComponentType, ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { SettingsCard } from './settings-card'

interface SettingsLockedStateProps {
  title: string
  description: string
  icon?: ComponentType<{ className?: string }>
  primaryLabel?: string
  primaryTo?: string
  secondaryLabel?: string
  secondaryTo?: string
  action?: ReactNode
}

export const SettingsLockedState = ({
  title,
  description,
  icon: Icon = Lock,
  primaryLabel = 'Sign In',
  primaryTo = '/auth/login',
  secondaryLabel,
  secondaryTo,
  action,
}: SettingsLockedStateProps) => {
  const location = useLocation()

  return (
    <SettingsCard className="p-8 sm:p-10 text-center space-y-5 max-w-xl mx-auto my-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">{description}</p>
      </div>
      {action ?? (
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          {secondaryLabel && secondaryTo && (
            <DkButton asChild variant="primary" size="md" className="w-full sm:w-auto">
              <Link to={secondaryTo}>{secondaryLabel}</Link>
            </DkButton>
          )}
          <DkButton
            asChild
            variant={secondaryLabel ? 'ghost' : 'primary'}
            size="md"
            className="w-full sm:w-auto"
          >
            <Link to={primaryTo} search={{ redirect: location.href }}>
              {primaryLabel}
            </Link>
          </DkButton>
        </div>
      )}
    </SettingsCard>
  )
};
