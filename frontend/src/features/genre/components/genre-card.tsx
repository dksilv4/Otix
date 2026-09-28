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
  Newspaper,
  Camera,
  Landmark,
  Mic,
  Brain,
  Target,
  Cpu,
  Puzzle,
  Trophy,
  Gauge,
  Palette,
  Joystick,
  Layers,
  Globe,
  Radio,
  Zap,
  Disc,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { DkImage } from '@ui/atoms/image'
import { cn } from '@/lib/utils'
import type { GenreOption } from '../types'

export interface GenreVisualConfig {
  icon: LucideIcon
  image: string
  accentColor: string
  gradient: string
}

export const GENRE_VISUAL_MAP: Record<string, GenreVisualConfig> = {
  // Movies & Universal
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

  // TV Specific
  'action-adventure': {
    icon: Flame,
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f97316',
    gradient: 'from-orange-950/90 via-emerald-950/40 to-transparent',
  },
  'sci-fi-fantasy': {
    icon: Wand2,
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/85 via-purple-950/45 to-transparent',
  },
  kids: {
    icon: Baby,
    image: 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/80 via-amber-950/40 to-transparent',
  },
  news: {
    icon: Newspaper,
    image: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80',
    accentColor: '#38bdf8',
    gradient: 'from-sky-950/85 via-blue-950/45 to-transparent',
  },
  reality: {
    icon: Camera,
    image: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800&auto=format&fit=crop&q=80',
    accentColor: '#d946ef',
    gradient: 'from-fuchsia-950/85 via-pink-950/40 to-transparent',
  },
  soap: {
    icon: Heart,
    image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ec4899',
    gradient: 'from-pink-950/90 via-rose-950/50 to-transparent',
  },
  talk: {
    icon: Mic,
    image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format&fit=crop&q=80',
    accentColor: '#8b5cf6',
    gradient: 'from-violet-950/85 via-indigo-950/45 to-transparent',
  },
  'war-politics': {
    icon: Landmark,
    image: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&auto=format&fit=crop&q=80',
    accentColor: '#64748b',
    gradient: 'from-slate-950/90 via-neutral-950/60 to-transparent',
  },

  // Games Specific
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
    icon: Target,
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ea580c',
    gradient: 'from-orange-950/90 via-red-950/50 to-transparent',
  },
  strategy: {
    icon: Brain,
    image: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=800&auto=format&fit=crop&q=80',
    accentColor: '#3b82f6',
    gradient: 'from-blue-950/85 via-indigo-950/45 to-transparent',
  },
  simulation: {
    icon: Cpu,
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80',
    accentColor: '#0ea5e9',
    gradient: 'from-cyan-950/85 via-teal-950/40 to-transparent',
  },
  puzzle: {
    icon: Puzzle,
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&auto=format&fit=crop&q=80',
    accentColor: '#10b981',
    gradient: 'from-emerald-950/85 via-teal-950/45 to-transparent',
  },
  sports: {
    icon: Trophy,
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80',
    accentColor: '#eab308',
    gradient: 'from-amber-950/85 via-yellow-950/45 to-transparent',
  },
  racing: {
    icon: Gauge,
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f97316',
    gradient: 'from-orange-950/90 via-amber-950/50 to-transparent',
  },
  fighting: {
    icon: Swords,
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ef4444',
    gradient: 'from-red-950/90 via-rose-950/50 to-transparent',
  },
  indie: {
    icon: Palette,
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    accentColor: '#a855f7',
    gradient: 'from-purple-950/85 via-fuchsia-950/45 to-transparent',
  },
  arcade: {
    icon: Joystick,
    image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/90 via-pink-950/50 to-transparent',
  },
  platformer: {
    icon: Layers,
    image: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=800&auto=format&fit=crop&q=80',
    accentColor: '#84cc16',
    gradient: 'from-lime-950/85 via-emerald-950/45 to-transparent',
  },
  casual: {
    icon: Smile,
    image: 'https://images.unsplash.com/photo-1514306191717-452ec28c7814?w=800&auto=format&fit=crop&q=80',
    accentColor: '#facc15',
    gradient: 'from-yellow-950/85 via-amber-950/40 to-transparent',
  },
  'open-world': {
    icon: Globe,
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80',
    accentColor: '#14b8a6',
    gradient: 'from-teal-950/85 via-emerald-950/45 to-transparent',
  },
  survival: {
    icon: ShieldAlert,
    image: 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=800&auto=format&fit=crop&q=80',
    accentColor: '#b45309',
    gradient: 'from-amber-950/90 via-stone-950/60 to-transparent',
  },
  mmo: {
    icon: Users,
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    accentColor: '#6366f1',
    gradient: 'from-indigo-950/85 via-cyan-950/45 to-transparent',
  },

  // Music Specific
  pop: {
    icon: Sparkles,
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ec4899',
    gradient: 'from-pink-950/85 via-fuchsia-950/45 to-transparent',
  },
  rock: {
    icon: Flame,
    image: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ef4444',
    gradient: 'from-red-950/90 via-amber-950/50 to-transparent',
  },
  electronic: {
    icon: Zap,
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    accentColor: '#06b6d4',
    gradient: 'from-cyan-950/90 via-purple-950/50 to-transparent',
  },
  'hip-hop': {
    icon: Disc,
    image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80',
    accentColor: '#f59e0b',
    gradient: 'from-amber-950/90 via-orange-950/50 to-transparent',
  },
  jazz: {
    icon: Music,
    image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&auto=format&fit=crop&q=80',
    accentColor: '#d97706',
    gradient: 'from-amber-950/90 via-yellow-950/50 to-transparent',
  },
  classical: {
    icon: Music,
    image: 'https://images.unsplash.com/photo-1520523839898-507127027581?w=800&auto=format&fit=crop&q=80',
    accentColor: '#38bdf8',
    gradient: 'from-sky-950/85 via-indigo-950/45 to-transparent',
  },
  metal: {
    icon: Skull,
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    accentColor: '#b91c1c',
    gradient: 'from-red-950/95 via-neutral-950/70 to-transparent',
  },
  country: {
    icon: Radio,
    image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop&q=80',
    accentColor: '#ca8a04',
    gradient: 'from-yellow-950/90 via-stone-950/50 to-transparent',
  },
  soundtrack: {
    icon: Film,
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
    accentColor: '#818cf8',
    gradient: 'from-indigo-950/85 via-sky-950/45 to-transparent',
  },
}

export const DEFAULT_VISUAL: GenreVisualConfig = {
  icon: Film,
  image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80',
  accentColor: '#a1a1aa',
  gradient: 'from-neutral-950/90 via-neutral-900/50 to-transparent',
}

/**
 * Normalizes input slugs or genre names and resolves the matching visual config.
 * Handles ampersands, punctuation, underscores, and compound terms gracefully.
 */
export function getGenreVisual(slugOrName?: string | null): GenreVisualConfig {
  if (!slugOrName) return DEFAULT_VISUAL

  const raw = slugOrName.toLowerCase().trim()
  if (GENRE_VISUAL_MAP[raw]) {
    return GENRE_VISUAL_MAP[raw]
  }

  const normalized = raw
    .replace(/&+/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (GENRE_VISUAL_MAP[normalized]) {
    return GENRE_VISUAL_MAP[normalized]
  }

  const withoutAnd = normalized.replace(/-and-/g, '-')
  if (GENRE_VISUAL_MAP[withoutAnd]) {
    return GENRE_VISUAL_MAP[withoutAnd]
  }

  // Prefix or partial match for compound or localized genre names
  for (const [key, config] of Object.entries(GENRE_VISUAL_MAP)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return config
    }
  }

  return DEFAULT_VISUAL
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movies',
  show: 'TV Shows',
  game: 'Games',
  music: 'Music',
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
  const visual = getGenreVisual(genre.slug) !== DEFAULT_VISUAL
    ? getGenreVisual(genre.slug)
    : getGenreVisual(genre.name)
  const Icon = visual.icon

  return (
    <Link
      to="/genre/$genreId"
      params={{ genreId: genre.slug }}
      search={mediaType ? { type: mediaType } : undefined}
      style={{
        '--genre-accent': visual.accentColor,
        '--genre-glow': `${visual.accentColor}40`,
      } as React.CSSProperties}
      className={cn(
        // Outer shell: no overflow clip so hover glow/shadow can breathe
        'group relative block select-none rounded-2xl',
        'shadow-[0_4px_20px_-2px_rgba(0,0,0,0.45)]',
        'hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.65),0_0_28px_0_var(--genre-glow)]',
        'hover:-translate-y-1.5 active:scale-[0.98]',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      aria-label={`Explore ${genre.name} genre`}
    >
      {/* Inner media plane: clips image/gradients only */}
      <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl aspect-[16/10] min-h-[175px] bg-neutral-950/80">
        <div className="absolute inset-0">
          <DkImage
            src={visual.image}
            alt={genre.name}
            priority={priority}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25" />
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-br opacity-50 group-hover:opacity-70 transition-opacity duration-500',
            visual.gradient,
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Soft watermark — no hard mask edge */}
        <Icon
          className="absolute right-3 bottom-3 h-16 w-16 text-white/[0.07] pointer-events-none select-none transition-all duration-500 ease-out group-hover:scale-105 group-hover:text-[var(--genre-accent)] group-hover:opacity-30"
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white/90 bg-black/50 backdrop-blur-md border border-white/[0.12] group-hover:border-white/[0.2] transition-colors duration-300">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: visual.accentColor }} />
              <span className="text-[11px] font-medium tracking-wide">
                {mediaType ? MEDIA_TYPE_LABELS[mediaType] || mediaType : 'Category'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <h3
              className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight"
              style={{
                textShadow: '0 2px 10px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)',
              }}
            >
              {genre.name}
            </h3>
            <p className="text-xs font-medium text-white/60 group-hover:text-white/90 transition-colors duration-200">
              Explore collection
            </p>
          </div>
        </div>

        {/* Clean bottom accent hairline */}
        <div
          className="absolute bottom-0 inset-x-0 h-px pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${visual.accentColor} 35%, ${visual.accentColor} 65%, transparent 100%)`,
          }}
        />
      </div>
    </Link>
  )
})
