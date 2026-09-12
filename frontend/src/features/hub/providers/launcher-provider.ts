import { Library, Scan, Gamepad2, Play } from 'lucide-react'
import { router } from '@/lib/router'
import { getDesktopAPI } from '@/lib/desktop/api'
import { fetchGames, fetchIsoPaths } from '@/features/launcher/data/storage'
import { PLATFORM_LABELS } from '@/constants/games'
import type { Command, CommandProvider } from '../types'

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? 'Installed game'
}

async function runScan(): Promise<void> {
  const api = getDesktopAPI()
  if (!api) return
  try {
    // Mirrors LauncherScanWidget: current game paths + ISO paths → scanPaths
    const paths = await api.getScanPaths()
    const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
    const isoPaths = await fetchIsoPaths()
    await api.scanPaths(gamePaths, isoPaths)
  } catch (err) {
    console.error('[hub] launcher scan failed:', err)
  }
}

/**
 * Local game library — the flagship "instant, offline" provider. Reads games
 * straight from the desktop SQLite cache (via IPC) and can launch them without
 * any network or account. Returns nothing when running in the browser.
 */
export function createLauncherProvider(): CommandProvider {
  const actions: Command[] = [
    {
      id: 'launcher:library',
      title: 'Open Game Library',
      icon: Library,
      domain: 'games',
      keywords: ['games', 'collection', 'library'],
      run: () => router.navigate({ to: '/launcher/library' }),
    },
    {
      id: 'launcher:scan',
      title: 'Scan for new games',
      icon: Scan,
      domain: 'games',
      keywords: ['scan', 'import', 'detect'],
      run: () => runScan(),
    },
  ]

  return {
    id: 'launcher',
    label: 'Games',
    domain: 'games',
    search: async (query: string): Promise<Command[]> => {
      const api = getDesktopAPI()
      if (!api) return []

      const q = query.trim().toLowerCase()

      // Empty query → default actions only
      if (!q) return actions

      const commands: Command[] = actions.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.keywords ?? []).some((k) => k.includes(q)),
      )

      const games = await fetchGames({ installed: true, limit: 50 })
      const matches = games
        .filter((g) => g.title.toLowerCase().includes(q))
        .slice(0, 5)

      for (const game of matches) {
        commands.push({
          id: `launcher:launch:${game.id}`,
          title: `Launch ${game.title}`,
          subtitle: platformLabel(game.platform),
          icon: Play,
          domain: 'games',
          run: () => {
            api.launchGame(game)
          },
        })
        commands.push({
          id: `launcher:open:${game.id}`,
          title: `Open ${game.title}`,
          subtitle: 'Game page',
          icon: Gamepad2,
          domain: 'games',
          run: () =>
            router.navigate({
              to: '/launcher/$gameId',
              params: { gameId: game.id },
            }),
        })
      }

      return commands
    },
  }
}
