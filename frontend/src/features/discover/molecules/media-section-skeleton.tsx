import { cn } from '@/lib/utils'

export function MediaSectionSkeleton() {
  return (
    <div className="w-full space-y-4 animate-fade-in">
      <div className="flex items-center justify-between px-4">
        {/* Title skeleton */}
        <div className="h-6 w-48 rounded-md bg-white/[0.04] shimmer" />
        {/* Navigation skeleton */}
        <div className="flex gap-2">
          <div className="h-8 w-8 rounded-full bg-white/[0.04] shimmer" />
          <div className="h-8 w-8 rounded-full bg-white/[0.04] shimmer" />
        </div>
      </div>
      <div className="flex gap-4 overflow-x-hidden px-4 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-[140px] md:w-[180px] shrink-0 rounded-2xl p-2',
              'bg-gradient-to-br from-[var(--dk-surface-glass)] to-transparent',
              'ring-1 ring-white/[0.04] backdrop-blur-sm',
            )}
          >
            {/* Poster skeleton */}
            <div className="aspect-[2/3] w-full rounded-xl bg-white/[0.04] shimmer mb-3" />
            {/* Title & Info skeleton */}
            <div className="space-y-2 px-1">
              <div className="h-4 w-5/6 rounded bg-white/[0.04] shimmer" />
              <div className="h-3 w-1/2 rounded bg-white/[0.04] shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
