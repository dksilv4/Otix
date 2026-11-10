import type { ComponentType, LazyExoticComponent } from 'react'
import { safeLazy } from '@/lib/utils/chunk-reload'
import type { LauncherThemeId } from '@/features/launcher/themes/types'

export const THEME_VIEWS: Record<LauncherThemeId, LazyExoticComponent<ComponentType>> = {
  classic: safeLazy(() =>
    import('@/features/launcher/themes/classic/classic-launcher-view').then((m) => ({
      default: m.ClassicLauncherView,
    })),
  ),
  modern: safeLazy(() =>
    import('@/features/launcher/themes/modern/modern-launcher-view').then((m) => ({
      default: m.ModernLauncherView,
    })),
  ),
  steam: safeLazy(() =>
    import('@/features/launcher/themes/steam/steam-launcher-view').then((m) => ({
      default: m.SteamLauncherView,
    })),
  ),
  playstation: safeLazy(() =>
    import('@/features/launcher/themes/playstation/playstation-launcher-view').then((m) => ({
      default: m.PlayStationLauncherView,
    })),
  ),
  xbox: safeLazy(() =>
    import('@/features/launcher/themes/xbox/xbox-launcher-view').then((m) => ({
      default: m.XboxLauncherView,
    })),
  ),
  switch: safeLazy(() =>
    import('@/features/launcher/themes/switch/switch-launcher-view').then((m) => ({
      default: m.SwitchLauncherView,
    })),
  ),
  retro: safeLazy(() =>
    import('@/features/launcher/themes/retro/retro-launcher-view').then((m) => ({
      default: m.RetroLauncherView,
    })),
  ),
  minimal: safeLazy(() =>
    import('@/features/launcher/themes/minimal/minimal-launcher-view').then((m) => ({
      default: m.MinimalLauncherView,
    })),
  ),
  forge: safeLazy(() =>
    import('@/features/launcher/themes/forge/forge-launcher-view').then((m) => ({
      default: m.ForgeLauncherView,
    })),
  ),
  glass: safeLazy(() =>
    import('@/features/launcher/themes/glass/glass-launcher-view').then((m) => ({
      default: m.GlassLauncherView,
    })),
  ),
}
