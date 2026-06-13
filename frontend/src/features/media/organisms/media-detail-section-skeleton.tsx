export function SectionSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-white/[0.06]"
      style={{
        minHeight: height,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
      }}
    />
  )
}
