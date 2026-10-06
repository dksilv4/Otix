import type { FeatureStatusKind } from '@/components/ui/atoms/feature-status-tag'

/** Map plugin manifest stage → status chips (stable → none). */
export const kindsFromPluginStage = (stage?: string | null): FeatureStatusKind[] => {
  if (stage === 'alpha') return ['alpha']
  if (stage === 'beta') return ['beta']
  return []
}
