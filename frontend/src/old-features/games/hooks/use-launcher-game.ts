import { useLocalGame } from '@/old-features/game-scanner/game-queries'
<<<<<<<< HEAD:frontend/src/features/launcher/hooks/use-launcher-game.ts
import { useGameDetail } from '@/features/launcher/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'
import type { LocalGame } from '@/features/launcher/types'
========
import { useGameDetail } from '@/old-features/games/games-queries'
import { hasDesktopAPI } from '@/lib/desktop/api'
import type { LocalGame } from '@/old-features/games/types'
>>>>>>>> d607927de356d7641bc4391ed7e97bc43aae7dc2:frontend/src/old-features/games/hooks/use-launcher-game.ts

export function useLauncherGame(gameId: string | undefined) {
  const isDesktop = hasDesktopAPI()
  const { data: localGame, isLoading } = useLocalGame(gameId)
  const { data: catalogDetail } = useGameDetail(gameId)

  if (localGame) return { game: localGame, isLoading: false }

  if (!isDesktop && catalogDetail) {
    const webGame: LocalGame = {
      id: catalogDetail.id,
      title: catalogDetail.title,
      platform: 'unknown' as const,
      exePath: '',
      installDir: '',
      iconUrl: catalogDetail.iconUrl ?? undefined,
      posterUrl: catalogDetail.posterUrl ?? undefined,
      data: catalogDetail as unknown as LocalGame['data'],
    }
    return { game: webGame, isLoading: false }
  }

  return { game: undefined as LocalGame | undefined, isLoading }
}
