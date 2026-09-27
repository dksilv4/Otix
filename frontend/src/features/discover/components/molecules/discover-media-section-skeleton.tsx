import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'

interface MediaSectionSkeletonProps {
  cardAspectRatio?: string
  cardWidth?: string
  cardClassName?: string
  count?: number
}

export function MediaSectionSkeleton({
  cardAspectRatio = 'aspect-[2/3]',
  cardWidth = 'w-[200px]',
  cardClassName,
  count = 6,
}: MediaSectionSkeletonProps = {}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between px-4 lg:px-8">
        <Skeleton className="h-7 w-48 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-none px-4 lg:px-8">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('shrink-0 rounded-xl', cardAspectRatio, cardWidth, cardClassName)}
          />
        ))}
      </div>
    </div>
  )
}
