import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { DkSkeleton } from "./skeleton"
import './image.scss'

interface DkImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode
}

function DkImage({ className, src, alt, fallback, onError, ...props }: DkImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError || !src) {
    return (
      <div className={cn("dk-image__fallback", className)}>
        {fallback || alt?.[0]?.toUpperCase() || "?"}
      </div>
    )
  }

  return (
    <div className={cn("dk-image", className)}>
      {isLoading && <DkSkeleton className="dk-image__skeleton" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn("dk-image__img", isLoading ? "dk-image__img--loading" : "dk-image__img--loaded")}
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

export { DkImage, DkImage as Image }
