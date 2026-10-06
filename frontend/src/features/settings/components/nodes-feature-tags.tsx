import { FeatureStatusTags } from '@ui/atoms/feature-status-tag'

/** Status chips for Otix nodes (same beta / WIP tags as game servers). */
export const NodesFeatureTags = ({ className }: { className?: string }) => {
  return <FeatureStatusTags kinds={['beta', 'wip']} className={className} />
};
