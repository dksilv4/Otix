import type { ReactNode } from 'react'
import { useFeature } from '../../hooks/use-feature'
import type { FeatureName } from '../../types'

export function FeatureFallback({
  name,
  children,
}: {
  name: FeatureName
  children: ReactNode
}) {
  const enabled = useFeature(name)
  return enabled ? null : <>{children}</>
}
