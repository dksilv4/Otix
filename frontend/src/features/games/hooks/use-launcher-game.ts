import { useLocalGame } from '@/features/game-scanner/game-queries'
import { useGameDetail } from '@/features/games/games-queries'
import { hasDesktopAPI } from '@/lib/desktop-api'
import type { LocalGame } from '@/features/games/types'

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
