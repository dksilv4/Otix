export const AudioFeatureRow = ({
  featKey,
  label,
  features,
}: {
  featKey: string
  label: string
  features: Record<string, unknown>
}) => {
  const raw = features[featKey]
  if (raw == null || typeof raw !== 'number') return null

  if (featKey === 'tempo') {
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono tabular-nums text-foreground">{Math.round(raw)} BPM</span>
        </div>
      </div>
    )
  }

  const pct = Math.round(Math.min(1, Math.max(0, raw)) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--dk-surface-glass)]">
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
};
