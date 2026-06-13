export function SeasonProgressBar({ watched, total }: { watched: number; total: number }) {
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full overflow-hidden bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs shrink-0 text-muted-foreground tabular-nums">
        {watched}/{total}
      </span>
    </div>
  )
}
