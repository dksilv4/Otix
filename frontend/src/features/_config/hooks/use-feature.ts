import { useContext, useMemo } from 'react'
import { FeatureContext } from './feature-context'
import { REGISTRY } from '../registry'
import type { FeatureName } from '../types'

export function useFeature(name: FeatureName): boolean {
  const overrides = useContext(FeatureContext)

  return useMemo(() => {
    const checkActive = (feat: FeatureName): boolean => {
      // 1. Dynamic context override has highest precedence
      if (overrides[feat] === true) return true
      if (overrides[feat] === false) return false

      // 2. Explicit registry config
      const def = REGISTRY[feat]
      if (!def || def.enabled !== true) return false

      // 3. Dependencies check
      if (def.dependsOn) {
        for (const dep of def.dependsOn) {
          if (!checkActive(dep)) return false
        }
      }

      // 4. Parent check (e.g. auth:steam requires auth)
      const lastColon = feat.lastIndexOf(':')
      if (lastColon !== -1) {
        const parent = feat.substring(0, lastColon) as FeatureName
        if (!checkActive(parent)) return false
      }

      return true
    }

    return checkActive(name)
  }, [name, overrides])
}

