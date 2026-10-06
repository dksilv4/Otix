import { Skeleton } from '@ui/atoms/skeleton'

export const NotificationSkeleton = ({ count = 8 }: { count?: number }) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-sm" />
          </div>
        </div>
      ))}
    </div>
  )
};
