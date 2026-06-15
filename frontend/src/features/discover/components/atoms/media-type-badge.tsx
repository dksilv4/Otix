import { Film, Tv, Gamepad2, Music } from 'lucide-react'
import { cn } from '@/lib/utils'

const MEDIA_ICONS = {
  movie: Film,
  show: Tv,
  game: Gamepad2,
  music: Music,
} as const

const MEDIA_COLORS = {
  movie: 'bg-blue-500',
  show: 'bg-green-500',
  game: 'bg-purple-500',
  music: 'bg-pink-500',
} as const

interface MediaTypeBadgeProps {
  mediaType: string
  className?: string
}

export function MediaTypeBadge({ mediaType, className }: MediaTypeBadgeProps) {
  const Icon = MEDIA_ICONS[mediaType as keyof typeof MEDIA_ICONS]
  if (!Icon) return null

  return (
    <span className={cn(
      'flex h-6 w-6 items-center justify-center rounded-full',
      MEDIA_COLORS[mediaType as keyof typeof MEDIA_COLORS] || 'bg-gray-500',
      className,
    )}>
      <Icon className="h-3 w-3 text-white" />
    </span>
  )
}
