import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode
}

function Image({ className, src, alt, fallback, onError, ...props }: ImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError || !src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground text-xs",
          className,
        )}
      >
        {fallback || alt?.[0]?.toUpperCase() || "?"}
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {isLoading && <Skeleton className="absolute inset-0" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "h-full w-full object-cover transition-opacity",
          isLoading ? "opacity-0" : "opacity-100",
        )}
        onLoad={() => setIsLoading(false)}
        onError={(e) => {
          setHasError(true)
          onError?.(e)
        }}
        {...props}
      />
    </div>
  )
}

export { Image }
