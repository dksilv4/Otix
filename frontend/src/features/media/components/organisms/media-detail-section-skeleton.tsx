export const SectionSkeleton = ({ height = 200 }: { height?: number }) => {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] animate-pulse"
      style={{
        minHeight: height,
      }}
    />
  )
};
