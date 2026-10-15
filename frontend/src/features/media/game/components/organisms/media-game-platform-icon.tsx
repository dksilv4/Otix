import { createElement } from 'react'
import { Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getPlatformIconComponent,
  isPS5Slug,
  isPS4Slug,
} from '@/features/media/game/utils/platform-icons'

interface PlatformIconProps {
  slug: string
  className?: string
}

export const PlatformIcon = ({ slug, className }: PlatformIconProps) => {
  if (isPS5Slug(slug)) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-[3px] bg-white font-sans text-[11px] font-black uppercase tracking-tight text-black shadow-sm select-none shrink-0 leading-none px-1.5 py-0.5',
          className
        )}
      >
        PS5
      </span>
    )
  }

  if (isPS4Slug(slug)) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-[3px] border border-white bg-black font-sans text-[11px] font-black uppercase tracking-tight text-white shadow-sm select-none shrink-0 leading-none px-1.5 py-0.5',
          className
        )}
      >
        PS4
      </span>
    )
  }

  const IconComponent = getPlatformIconComponent(slug)

  if (IconComponent) {
    return createElement(IconComponent, {
      className: className || 'h-4 w-4 text-muted-foreground shrink-0',
    })
  }

  return <Gamepad2 className={className || 'h-4 w-4 text-muted-foreground shrink-0'} />
}
