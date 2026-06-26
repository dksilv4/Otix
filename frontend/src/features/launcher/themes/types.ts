import type { ComponentType } from 'react'

// ── Manifest ──────────────────────────────────────────────

export interface LauncherThemeManifest {
  id: string
  name: string
  description: string
  author: string
  version: string
  preview: string
  tags?: string[]
}

// ── Component prop types (matching existing component signatures) ──

export interface ShelfCardProps {
  game?: import('@/features/launcher/types').LocalGame
  catalogGame?: import('@/features/launcher/types').CatalogGame
  onClick: (id: string) => void
  onAcceptSuggestion?: (game: import('@/features/launcher/types').LocalGame) => void
  onRejectSuggestion?: (game: import('@/features/launcher/types').LocalGame) => void
}

export interface MatchGameModalProps {
  game: import('@/features/launcher/types').LocalGame
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface GameThumbProps {
  icon: string | undefined
  alt: string
}

export interface PlayButtonProps {
  game: import('@/features/launcher/types').LocalGame
}

export interface ProgressBarProps {
  progress: number
}

export interface WithIdProps {
  id?: string
}

// ── Component slots ──────────────────────────────────────

export interface LauncherThemeComponents {
  // Organisms
  Hero?: ComponentType<object>
  Shelf?: ComponentType<WithIdProps>
  Footer?: ComponentType<WithIdProps>
  GameButtons?: ComponentType<object>

  // Molecules
  FloatingSelector?: ComponentType<object>
  ShelfCard?: ComponentType<ShelfCardProps>
  GameStats?: ComponentType<object>
  GameCompanies?: ComponentType<object>
  GameDetailInfo?: ComponentType<object>
  EmptyState?: ComponentType<object>
  LoadingState?: ComponentType<WithIdProps>
  MatchGameModal?: ComponentType<MatchGameModalProps>
  DiskSpaceWidget?: ComponentType<WithIdProps>
  ScanWidget?: ComponentType<WithIdProps>

  // Atoms
  GameThumb?: ComponentType<GameThumbProps>
  PlayButton?: ComponentType<PlayButtonProps>
  PlaytimeStats?: ComponentType<object>
  RatingStats?: ComponentType<object>
  ProgressBar?: ComponentType<ProgressBarProps>
}

// ── Layout ────────────────────────────────────────────────

export interface LauncherThemeLayout {
  navPosition?: 'top' | 'left'
  heroHeight?: 'full' | 'half' | 'compact'
  heroParallax?: boolean
  shelfDensity?: 'comfortable' | 'compact'
  showFloatingSelector?: boolean
  backgroundType?: 'solid' | 'gradient' | 'shader' | 'image'
}

// ── Theme ─────────────────────────────────────────────────

export interface LauncherTheme {
  meta: LauncherThemeManifest
  components?: Partial<LauncherThemeComponents>
  tokens?: Record<string, string>
  layout?: Partial<LauncherThemeLayout>
}

export interface LauncherThemeModule {
  default: LauncherTheme
}
