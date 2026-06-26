import type { LauncherThemeModule } from './types'

interface RegistryEntry {
  id: string
  loader: () => Promise<LauncherThemeModule>
}

const ENTRIES: RegistryEntry[] = [
  {
    id: 'default',
    loader: () => import('./default/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'light',
    loader: () => import('./light/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'retro',
    loader: () => import('./retro/index').then(m => m as unknown as LauncherThemeModule),
  },
  {
    id: 'minimal',
    loader: () => import('./minimal/index').then(m => m as unknown as LauncherThemeModule),
  },
]

const moduleCache = new Map<string, LauncherThemeModule>()

export async function getThemeModule(themeId: string): Promise<LauncherThemeModule> {
  // Check cache first
  const cached = moduleCache.get(themeId)
  if (cached) return cached

  const entry = ENTRIES.find(e => e.id === themeId)
  if (!entry) {
    // Unknown theme — fall back to default
    console.warn(`Unknown theme "${themeId}", falling back to default`)
    return getThemeModule('default')
  }

  const mod = await entry.loader()
  moduleCache.set(themeId, mod)
  return mod
}

export function getThemeIds(): string[] {
  return ENTRIES.map(e => e.id)
}

// Preload default theme eagerly so it's always available
getThemeModule('default')
