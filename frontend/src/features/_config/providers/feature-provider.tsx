import type { ReactNode } from 'react'
import { FeatureContext } from '../hooks/feature-context'
import type { FeatureOverrides } from '../types'

export const FeatureProvider = ({
  overrides = {},
  children,
}: {
  overrides?: FeatureOverrides
  children: ReactNode
}) => {
  return <FeatureContext value={overrides}>{children}</FeatureContext>
};
