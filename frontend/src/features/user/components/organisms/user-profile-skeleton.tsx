import { Skeleton } from '@ui/atoms/skeleton'

export const UserProfileSkeleton = () => {
  return (
    <div className="h-[60vh] rounded-2xl">
      <Skeleton className="h-full w-full" />
    </div>
  )
};
