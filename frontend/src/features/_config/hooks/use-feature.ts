import { useContext, useMemo } from 'react'
import { FeatureContext } from './feature-context'
import { REGISTRY } from '../registry'
import type { FeatureName } from '../types'

export function useFeature(name: FeatureName): boolean {
  const overrides = useContext(FeatureContext)

  return useMemo(() => {
    const segments = name.split(':')
    const chain: FeatureName[] = []
    for (let i = 1; i <= segments.length; i++) {
      chain.push(segments.slice(0, i).join('.') as FeatureName)
    }

    // Walk root → leaf, all links must be enabled
    for (const key of chain) {
      if (overrides[key] === true) continue
      if (overrides[key] === false) return false

      // No explicit override — check if dependsOn are satisfied
      const def = REGISTRY[key]
      if (def?.dependsOn?.every((dep) => overrides[dep] === true)) continue

      return false
    }

    return true
  }, [name, overrides])
}
