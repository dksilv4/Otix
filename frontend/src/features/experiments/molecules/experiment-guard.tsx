import { type ReactNode } from 'react'
import { useExperiment } from '../experiments-provider'

interface ExperimentGuardProps {
  feature: string
  children: ReactNode
  fallback?: ReactNode
}

export function ExperimentGuard({ feature, children, fallback = null }: ExperimentGuardProps) {
  const { enabled } = useExperiment(feature)
  if (!enabled) return <>{fallback}</>
  return <>{children}</>
}
