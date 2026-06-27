import { useLocalGame } from '@/features/launcher/game-queries'
import { useGameDetail } from '@/features/launcher/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'
import type { LocalGame } from '@/features/launcher/types'

export function useLauncherGame(gameId: string | undefined) {
  const isDesktop = hasDesktopAPI()
  const { data: localGame, isLoading } = useLocalGame(gameId)
  // For desktop matched games, use the otix ID for catalog detail fetch.
  // For web, gameId is already a catalog UUID. Falls back gracefully via enabled check.
  const catalogId = localGame?.otixMediaId || (!isDesktop ? gameId : undefined)
  const { data: catalogDetail } = useGameDetail(catalogId)

  // Merge catalog data into local game — prefers data, falls back to otix* fields / catalog detail
  if (localGame) {
    const hasRichData = localGame.data?.backdropUrl && localGame.data?.posterUrl
    if (!hasRichData) {
      // Try catalog API detail first, then desktop otix* fields, then nothing
      const catalogSource = catalogDetail as Record<string, unknown> ?? {}
      const richData = {
        id: localGame.otixMediaId || localGame.data?.id || '',
        title: localGame.otixMediaTitle || localGame.data?.title || localGame.title,
        slug: localGame.otixMediaSlug || localGame.data?.slug || '',
        posterUrl: localGame.otixPosterUrl || (catalogSource.posterUrl as string) || localGame.data?.posterUrl || null,
        backdropUrl: localGame.otixBackdropUrl || (catalogSource.backdropUrl as string) || localGame.data?.backdropUrl || null,
        textlessPosterUrl: localGame.otixTextlessPosterUrl || (catalogSource.textlessPosterUrl as string) || localGame.data?.textlessPosterUrl || null,
        logoUrl: localGame.otixLogoUrl || (catalogSource.logoUrl as string) || localGame.data?.logoUrl || null,
        iconUrl: localGame.otixIconUrl || (catalogSource.iconUrl as string) || localGame.data?.iconUrl || null,
      } as Game
      return {
        game: { ...localGame, data: richData } as LocalGame,
        isLoading: false,
      }
    }
    return { game: localGame, isLoading: false }
  }

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
