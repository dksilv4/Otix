import { cn } from "@/lib/utils"

const DkSkeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("rounded-md bg-white/[0.04] shimmer", className)} {...props} />
};

export { DkSkeleton, DkSkeleton as Skeleton }
