import { cn } from "@/lib/utils"

const DkSkeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("rounded-md bg-muted shimmer", className)} {...props} />
};

export { DkSkeleton, DkSkeleton as Skeleton }
