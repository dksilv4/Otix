import { useState, useEffect } from "react"
import { Gamepad2 } from "lucide-react"

interface GameThumbProps {
  icon?: string | null
  alt: string
}

export const LauncherGameThumb = ({ icon, alt }: GameThumbProps) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [icon])

  return (
    <div className="w-full h-full relative">
      {icon && !hasError ? (
        <img
          src={icon}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[var(--dk-surface-ghost)] text-muted-foreground">
          <Gamepad2 size={16} className="opacity-50" />
        </div>
      )}
    </div>
  )
};

export default LauncherGameThumb;
