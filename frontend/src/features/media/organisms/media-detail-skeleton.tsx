import { Skeleton } from '@ui/atoms/skeleton'

export function DetailSkeleton() {
  return (
    <div className="space-y-12">
      <div className="relative flex min-h-[65vh] items-end overflow-hidden rounded-3xl border border-white/[0.06] lg:min-h-[75vh]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-white/[0.06]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-background/20" />
        </div>

        <div className="relative z-10 mx-auto w-full px-4 pb-12 pt-24 sm:px-6 lg:max-w-7xl lg:px-8">
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

      <div className="mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-24 shrink-0 text-center">
              <Skeleton className="mx-auto h-20 w-20 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-3 w-16" />
              <Skeleton className="mx-auto mt-1 h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
