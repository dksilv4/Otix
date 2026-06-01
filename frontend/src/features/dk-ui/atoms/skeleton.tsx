import { cn } from "@/lib/utils"

function DkSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />
}

export { DkSkeleton, DkSkeleton as Skeleton }
