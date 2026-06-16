import { Skeleton } from '@ui/atoms/skeleton'

export function DetailSkeleton() {
  return (
    <div className="animate-fade-in pb-16">
      {/* ── Hero Skeleton ── */}
      <div className="relative flex min-h-[65vh] items-end overflow-hidden rounded-3xl mt-18 mx-6 lg:min-h-[75vh]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.06]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-background/20" />
        </div>

        <div className="relative z-10 w-full px-8 pb-12 pt-24">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 lg:gap-12">
            <div className="w-40 shrink-0 sm:w-44 lg:w-56 xl:w-64">
              <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <Skeleton className="mb-2 h-12 w-56 sm:h-14 lg:h-16" />
              <Skeleton className="h-4 w-72 sm:h-5 sm:w-80" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
              </div>
              <div className="mt-1 w-full max-w-2xl space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-5/6" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-18 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content Sections Skeleton ── */}
      <div className="flex flex-col mx-auto w-full max-w-6xl px-6 space-y-6 mt-6">
        {/* Group 1: About Card */}
        <div className="glass-card p-6 sm:p-8 space-y-5">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
        </div>

        {/* Group 2: Activity Card */}
        <div className="glass-card p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>

        {/* Group 3: Discovery (Carousels) */}
        <div className="space-y-4">
          <Skeleton className="h-5 w-40 px-4" />
          <div className="flex gap-4 overflow-hidden px-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-36 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Group 4: Details Card */}
        <div className="glass-card p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-28" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
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
    </div>
  )
}
