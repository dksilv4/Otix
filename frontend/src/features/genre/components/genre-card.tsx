import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Flame,
  Compass,
  Sparkles,
  Smile,
  ShieldAlert,
  Film,
  Heart,
  Wand2,
  Ghost,
  Search,
  Rocket,
  Music,
  Gamepad2,
  Swords,
  Baby,
  Skull,
  Eye,
  Tv,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import type { GenreOption } from '../types'

interface GenreVisualConfig {
  icon: LucideIcon
  image: string
  accentColor: string
  gradient: string
}

export const GENRE_VISUAL_MAP: Record<string, GenreVisualConfig> = {
  action: {
    icon: Flame,
    image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f97316',
    gradient: 'from-orange-950/80 via-red-950/40 to-transparent',
  },
  adventure: {
    icon: Compass,
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80',
    accentColor: '#10b981',
    gradient: 'from-emerald-950/80 via-teal-950/40 to-transparent',
  },
  animation: {
    icon: Sparkles,
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ec4899',
    gradient: 'from-pink-950/80 via-fuchsia-950/40 to-transparent',
  },
  comedy: {
    icon: Smile,
    image: 'https://images.unsplash.com/photo-1514306191717-452ec28c7814?w=800&auto=format&fit=crop&q=80',
    accentColor: '#eab308',
    gradient: 'from-amber-950/80 via-yellow-950/40 to-transparent',
  },
  crime: {
    icon: ShieldAlert,
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ef4444',
    gradient: 'from-red-950/90 via-rose-950/50 to-transparent',
  },
  documentary: {
    icon: Film,
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80',
    accentColor: '#38bdf8',
    gradient: 'from-sky-950/80 via-blue-950/40 to-transparent',
  },
  drama: {
    icon: Eye,
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&auto=format&fit=crop&q=80',
    accentColor: '#a855f7',
    gradient: 'from-purple-950/80 via-indigo-950/40 to-transparent',
  },
  family: {
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop&q=80',
    accentColor: '#14b8a6',
    gradient: 'from-teal-950/80 via-cyan-950/40 to-transparent',
  },
  fantasy: {
    icon: Wand2,
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    accentColor: '#8b5cf6',
    gradient: 'from-violet-950/80 via-purple-950/40 to-transparent',
  },
  history: {
    icon: Compass,
    image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
    accentColor: '#d97706',
    gradient: 'from-amber-950/90 via-yellow-950/50 to-transparent',
  },
  horror: {
    icon: Ghost,
    image: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=800&auto=format&fit=crop&q=80',
    accentColor: '#dc2626',
    gradient: 'from-red-950/95 via-neutral-950/60 to-transparent',
  },
  music: {
    icon: Music,
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f43f5e',
    gradient: 'from-rose-950/80 via-pink-950/40 to-transparent',
  },
  mystery: {
    icon: Search,
    image: 'https://images.unsplash.com/photo-1481833761820-0509d3217039?w=800&auto=format&fit=crop&q=80',
    accentColor: '#6366f1',
    gradient: 'from-indigo-950/90 via-slate-950/50 to-transparent',
  },
  romance: {
    icon: Heart,
    image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f472b6',
    gradient: 'from-pink-950/80 via-rose-950/40 to-transparent',
  },
  'science-fiction': {
    icon: Rocket,
    image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/80 via-blue-950/40 to-transparent',
  },
  'sci-fi': {
    icon: Rocket,
    image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/80 via-blue-950/40 to-transparent',
  },
  thriller: {
    icon: Skull,
    image: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ef4444',
    gradient: 'from-red-950/90 via-neutral-950/50 to-transparent',
  },
  'tv-movie': {
    icon: Tv,
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
    accentColor: '#818cf8',
    gradient: 'from-indigo-950/80 via-blue-950/40 to-transparent',
  },
  war: {
    icon: Swords,
    image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80',
    accentColor: '#78716c',
    gradient: 'from-stone-950/90 via-neutral-950/50 to-transparent',
  },
  western: {
    icon: Compass,
    image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop&q=80',
    accentColor: '#d97706',
    gradient: 'from-amber-950/90 via-yellow-950/50 to-transparent',
  },
  'role-playing-rpg': {
    icon: Gamepad2,
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    accentColor: '#8b5cf6',
    gradient: 'from-purple-950/80 via-violet-950/40 to-transparent',
  },
  rpg: {
    icon: Gamepad2,
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    accentColor: '#8b5cf6',
    gradient: 'from-purple-950/80 via-violet-950/40 to-transparent',
  },
  shooter: {
    icon: Swords,
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ea580c',
    gradient: 'from-orange-950/90 via-red-950/50 to-transparent',
  },
}

const DEFAULT_VISUAL: GenreVisualConfig = {
  icon: Film,
  image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
  accentColor: '#a1a1aa',
  gradient: 'from-neutral-950/90 via-neutral-900/50 to-transparent',
}

export interface GenreCardProps {
  genre: GenreOption
  mediaType?: 'movie' | 'show' | 'game' | 'music'
  className?: string
  priority?: boolean
}

export const GenreCard = memo(function GenreCard({
  genre,
  mediaType,
  className,
  priority = false,
}: GenreCardProps) {
  const slugKey = genre.slug?.toLowerCase() || ''
  const nameKey = genre.name?.toLowerCase().replace(/\s+/g, '-') || ''
  const visual = GENRE_VISUAL_MAP[slugKey] || GENRE_VISUAL_MAP[nameKey] || DEFAULT_VISUAL
  const Icon = visual.icon

  return (
    <Link
      to="/genre/$genreId"
      params={{ genreId: genre.slug }}
      search={mediaType ? { type: mediaType } : undefined}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] hover:border-white/25 transition-all duration-300 shadow-md hover:shadow-2xl select-none',
        'aspect-[16/10] min-h-[170px]',
        className,
      )}
    >
      {/* Background Image with smooth zoom */}
      <div className="absolute inset-0 overflow-hidden">
        <DkImage
          src={visual.image}
          alt={genre.name}
          priority={priority}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
      </div>

      {/* Multi-stage dark vignette & genre tint gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20" />
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-50 group-hover:opacity-75 transition-opacity duration-300',
          visual.gradient,
        )}
      />

      {/* Background Icon Watermark */}
      <Icon className="absolute -right-3 -bottom-3 h-28 w-28 text-white/[0.06] pointer-events-none transition-transform duration-500 group-hover:scale-125 group-hover:rotate-6" />

      {/* Top Header Strip: Icon Badge */}
      <div className="relative z-10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white/90 bg-black/40 backdrop-blur-md border border-white/[0.12] shadow-sm">
          <Icon className="h-3.5 w-3.5" style={{ color: visual.accentColor }} />
          <span className="text-[11px] font-medium tracking-wide">Category</span>
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] border border-white/[0.1] text-white/70 group-hover:text-white group-hover:bg-white/[0.18] transition-all duration-200">
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </div>
      </div>

      {/* Bottom Content: Big Bold Genre Name & Action Prompt */}
      <div className="relative z-10 p-4 pt-0 space-y-1">
        <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white group-hover:text-primary transition-colors leading-tight">
          {genre.name}
        </h3>
        <p className="text-xs font-medium text-white/60 group-hover:text-white/90 transition-colors flex items-center gap-1">
          Explore collection <span className="opacity-70">→</span>
        </p>
      </div>

      {/* Bottom glowing accent bar */}
      <div
        className="absolute bottom-0 inset-x-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${visual.accentColor}, transparent)`,
        }}
      />
    </Link>
  )
})
