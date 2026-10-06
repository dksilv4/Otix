import { MediaGrid } from "@ui/molecules/media-grid"

export const SkeletonGrid = () => {
  return (
    <MediaGrid>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[2/3] rounded-lg bg-[var(--dk-surface-glass)] animate-pulse"
        />
      ))}
    </MediaGrid>
  )
};
