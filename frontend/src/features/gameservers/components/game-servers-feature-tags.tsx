import { FeatureStatusTags } from '@ui/atoms/feature-status-tag'

/** Status chips for the dedicated game servers feature (beta / WIP). */
export function GameServersFeatureTags({ className }: { className?: string }) {
  return <FeatureStatusTags kinds={['beta', 'wip']} className={className} />
}
