import { Skeleton } from '@ui/atoms/skeleton'
import { useDesktopPlatform } from '@/lib/desktop/platform'

export function DetailSkeleton() {
  const { isDesktop } = useDesktopPlatform()

  return (
    <div
      id="media-detail"
      className={`animate-fade-in pb-28 ${isDesktop ? 'pt-[var(--title-bar-height,38px)]' : ''}`}
    >
      {/* ── Hero (mirrors MediaHero) ── */}
      <header className="relative min-h-[46vh] lg:min-h-[50vh] pb-6">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, color-mix(in oklab, var(--background) 100%, transparent) 0%, color-mix(in oklab, var(--background) 88%, transparent) 25%, color-mix(in oklab, var(--background) 55%, transparent) 60%, color-mix(in oklab, var(--background) 25%, transparent) 100%)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-22 pb-2">
          <div className="flex flex-col items-center sm:flex-row sm:items-end gap-6 sm:gap-8 lg:gap-10">
            {/* Poster */}
            <div className="w-36 shrink-0 sm:w-44 lg:w-56 xl:w-60">
              <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
            </div>

            {/* Title / meta / actions */}
            <div className="flex min-w-0 flex-1 flex-col items-center sm:items-start gap-3.5">
              <Skeleton className="h-12 w-56 sm:h-16 sm:w-72 lg:h-20 lg:w-96 rounded-lg" />
              <Skeleton className="h-4 w-64 sm:w-80 max-w-full" />
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-12 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-10 w-36 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content (mirrors MediaDetailPage grid) ── */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Storyline */}
            <div className="glass-card p-6 sm:p-7 space-y-4">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-0.5 rounded-full" />
                <Skeleton className="h-4 w-20" />
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

            {/* Cast & Crew */}
            <div className="glass-card p-6 sm:p-7 space-y-5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-0.5 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="w-16 shrink-0 text-center space-y-2">
                    <Skeleton className="mx-auto h-12 w-12 rounded-full" />
                    <Skeleton className="mx-auto h-2.5 w-12" />
                    <Skeleton className="mx-auto h-2 w-10" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 space-y-6">
            {/* Ratings hub */}
            <div className="glass-card p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            </div>

            {/* Where to watch */}
            <div className="glass-card p-5 sm:p-6 space-y-3">
              <Skeleton className="h-4 w-28" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
            </div>

            {/* Specs */}
            <div className="glass-card p-5 sm:p-6 space-y-3">
              <Skeleton className="h-4 w-20" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="glass-card p-6 sm:p-8 space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </main>

      {/* More Like This */}
      <section className="relative z-10 w-full mt-12 mb-6 space-y-4 px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-36" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-36 shrink-0 rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  )
}
