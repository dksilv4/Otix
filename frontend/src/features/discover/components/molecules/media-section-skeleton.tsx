import { Skeleton } from '@ui/atoms/skeleton'

export function MediaSectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between px-4 lg:px-8">
        <Skeleton className="h-7 w-48 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-[200px] shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
