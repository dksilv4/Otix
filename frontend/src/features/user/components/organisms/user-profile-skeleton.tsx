import { Skeleton } from '@ui/atoms/skeleton'

export function UserProfileSkeleton() {
  return (
    <div className="dk-user-profile-page__skeleton">
      <Skeleton className="h-full w-full" />
    </div>
  )
}
