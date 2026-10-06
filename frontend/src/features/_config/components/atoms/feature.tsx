import type { ReactNode } from 'react'
import { useFeature } from '../../hooks/use-feature'
import type { FeatureName } from '../../types'

export const Feature = ({
  name,
  children,
  fallback = null,
}: {
  name: FeatureName
  children: ReactNode
  fallback?: ReactNode
}) => {
  const enabled = useFeature(name)
  return enabled ? <>{children}</> : <>{fallback}</>
};
