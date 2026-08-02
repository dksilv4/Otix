import { Skeleton } from '@ui/atoms/skeleton'

export function DetailSkeleton() {
  return (
    <div className="animate-fade-in pb-20">
      {/* ── Hero Skeleton ── */}
      <div className="relative flex min-h-[45vh] items-end overflow-hidden rounded-3xl max-w-7xl mx-auto mt-4 sm:mt-6 lg:min-h-[50vh]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.06]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-background/20" />
        </div>

        <div className="relative z-10 w-full px-6 pb-14 pt-24">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-8 lg:gap-12">
            {/* Poster */}
            <div className="w-40 shrink-0 sm:w-44 lg:w-56 xl:w-64 translate-y-10">
              <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
            </div>

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <Skeleton className="mb-2 h-12 w-56 sm:h-14 lg:h-16" />
              <Skeleton className="h-4 w-72 sm:h-5 sm:w-80" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Section Skeletons ── */}
      <div className="flex flex-col mx-auto w-full max-w-6xl px-4 sm:px-6 space-y-4 mt-6">

        {/* Card 1: Interaction + Ratings */}
        <div className="glass-card px-6 py-6 sm:px-8 sm:py-7 space-y-6">
          <div className="flex flex-wrap justify-center gap-3">
            <Skeleton className="h-16 w-20 rounded-2xl" />
            <Skeleton className="h-16 w-20 rounded-2xl" />
            <Skeleton className="h-16 w-20 rounded-2xl" />
            <Skeleton className="h-16 w-20 rounded-2xl" />
          </div>
          <div className="border-t border-white/[0.06] pt-6">
            <div className="glass-inset rounded-3xl p-5 flex items-center gap-5">
              <Skeleton className="h-14 w-14 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: About */}
        <div className="glass-card px-6 py-6 sm:px-8 sm:py-7 space-y-4">
          {/* Section heading skeleton */}
          <div className="flex items-center gap-2.5 mb-5">
            <Skeleton className="h-4 w-0.5 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-9/12" />
          </div>
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>
        </div>

        {/* Card 3: Media-specific section */}
        <div className="glass-card px-6 py-6 sm:px-8 sm:py-7 space-y-4">
          <div className="flex gap-3 border-b border-white/[0.06] pb-3">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-20 shrink-0 rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        {/* Carousel row: More Like This */}
        <div className="space-y-3 px-1">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-36 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Card 4: Cast & Crew */}
        <div className="glass-card px-6 py-6 sm:px-8 sm:py-7 space-y-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-0.5 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-16 shrink-0 text-center space-y-2">
                <Skeleton className="mx-auto h-12 w-12 rounded-full" />
                <Skeleton className="mx-auto h-2.5 w-12" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
