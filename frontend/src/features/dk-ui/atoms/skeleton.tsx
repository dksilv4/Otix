import { cn } from "@/lib/utils"
import './skeleton.scss'

function DkSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("dk-skeleton shimmer", className)} {...props} />
}

export { DkSkeleton, DkSkeleton as Skeleton }
