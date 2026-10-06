import type { LauncherThemeId } from '@/features/launcher/themes/theme-context'

export type ThemeCategory = 'all' | 'console' | 'cinematic' | 'specialty'

export const THEME_CATEGORIES: { id: ThemeCategory; label: string }[] = [
  { id: 'all', label: 'All Themes' },
  { id: 'console', label: 'Console Editions' },
  { id: 'cinematic', label: 'Modern & Glass' },
  { id: 'specialty', label: 'Retro & Zen' },
]

export const getThemeCategory = (id: LauncherThemeId): ThemeCategory => {
  switch (id) {
    case 'steam':
    case 'playstation':
    case 'xbox':
    case 'switch':
      return 'console'
    case 'modern':
    case 'glass':
    case 'forge':
      return 'cinematic'
    case 'retro':
    case 'minimal':
    case 'classic':
    default:
      return 'specialty'
  }
}
