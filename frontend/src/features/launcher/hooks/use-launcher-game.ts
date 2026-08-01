import { useLocalGame } from '@/features/launcher/data/game-queries'
import { useGameDetail } from '@/features/launcher/data/queries'
import { hasDesktopAPI } from '@/lib/desktop/api'
import type { LocalGame, Game } from '@/features/launcher/types'

export function useLauncherGame(gameId: string | undefined) {
  const isDesktop = hasDesktopAPI()
  const { data: localGame, isLoading: isLocalLoading } = useLocalGame(gameId)
  // For desktop matched games, use the otix ID for catalog detail fetch.
  // For web, gameId is already a catalog UUID. Falls back gracefully via enabled check.
  const catalogId = localGame?.data?.id || localGame?.otixMediaId || (!isDesktop ? gameId : undefined)
  const { data: catalogDetail, isLoading: isCatalogLoading } = useGameDetail(catalogId)

  const isLoading = isDesktop ? (isLocalLoading || (!!catalogId && isCatalogLoading)) : isCatalogLoading

  // Merge catalog data into local game — prefers data, falls back to otix* fields / catalog detail
  if (localGame) {
    const hasRichData = !!(localGame.data?.backdropUrl && localGame.data?.posterUrl)
    const catalogSource = (catalogDetail as Record<string, unknown> | null) ?? {}

    if (!hasRichData) {
      const richData: Game = {
        id: localGame.otixMediaId || localGame.data?.id || '',
        title: localGame.otixMediaTitle || localGame.data?.title || localGame.title,
        slug: localGame.otixMediaSlug || localGame.data?.slug || '',
        posterUrl: (localGame.otixPosterUrl || catalogSource.posterUrl || localGame.data?.posterUrl) as string | undefined,
        backdropUrl: (localGame.otixBackdropUrl || catalogSource.backdropUrl || localGame.data?.backdropUrl) as string | undefined,
        textlessPosterUrl: (localGame.otixTextlessPosterUrl || catalogSource.textlessPosterUrl || localGame.data?.textlessPosterUrl) as string | null | undefined,
        logoUrl: (localGame.otixLogoUrl || catalogSource.logoUrl || localGame.data?.logoUrl) as string | undefined,
        iconUrl: (localGame.otixIconUrl || catalogSource.iconUrl || localGame.data?.iconUrl) as string | undefined,
        screenshots: (catalogSource.screenshots || localGame.data?.screenshots) as Game['screenshots'],
      }
      return {
        game: { ...localGame, data: richData } as LocalGame,
        isLoading,
      }
    }

    // Already has rich data — merge screenshots from catalog if newer
    if (catalogSource.screenshots && !localGame.data?.screenshots?.length) {
      return {
        game: {
          ...localGame,
          data: { ...localGame.data, screenshots: catalogSource.screenshots as Game['screenshots'] },
        } as LocalGame,
        isLoading,
      }
    }

    return { game: localGame, isLoading }
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
      data: {
        ...(catalogDetail as unknown as Game),
        screenshots: (catalogDetail as unknown as Record<string, unknown>).screenshots as Game['screenshots'],
      } as LocalGame['data'],
    }
    return { game: webGame, isLoading }
  }

  return { game: undefined as LocalGame | undefined, isLoading }
}
