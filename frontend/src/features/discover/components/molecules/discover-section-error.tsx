interface DiscoverSectionErrorProps {
  title?: string
  onRetry: () => void
}

export function DiscoverSectionError({ title, onRetry }: DiscoverSectionErrorProps) {
  return (
    <div className="space-y-3 px-4 lg:px-8 py-2">
      {title && <h2 className="text-xl font-bold tracking-tight text-white/90">{title}</h2>}
      <p className="text-sm text-white/60">Failed to load this section.</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm text-white/80"
      >
        Retry
      </button>
    </div>
  )
}
