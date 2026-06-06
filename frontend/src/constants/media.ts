// TODO: Review this file
import { Film, Tv, Gamepad2, Music, type LucideIcon } from 'lucide-react'

export type MediaType = 'movie' | 'show' | 'game' | 'music'

export const MEDIA_TYPES: MediaType[] = ['movie', 'show', 'game', 'music']

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  movie: 'Movie',
  show: 'TV',
  game: 'Game',
  music: 'Music',
}

export const MEDIA_TYPE_ICON: Record<MediaType, LucideIcon> = {
  movie: Film,
  show: Tv,
  game: Gamepad2,
  music: Music,
}

/** Solid badge colors (Tailwind bg-* classes) */
export const MEDIA_TYPE_COLOR: Record<MediaType, string> = {
  movie: 'bg-rose-600',
  show: 'bg-violet-600',
  game: 'bg-emerald-600',
  music: 'bg-amber-600',
}

/** Tinted/ring variant for list views and timeline badges */
export const MEDIA_TYPE_COLOR_TINTED: Record<MediaType, string> = {
  movie: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  show: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  game: 'bg-purple-500/10 text-purple-400 ring-purple-500/20',
  music: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
}
