import { useMemo } from 'react'
import { useLocalGame } from '@/features/launcher/data/game-queries'
import { useGameDetail } from '@/features/launcher/data/queries'
import { useServerGames } from '@/features/downloads/use-server-downloads'
import { hasDesktopAPI } from '@/lib/desktop/api'
import { OTIX_DEFAULT_GAME, OTIX_DEFAULT_GAME_ID } from '@/features/launcher/data/otix-default-game'
import type { LocalGame, Game } from '@/features/launcher/types'

export function useLauncherGame(gameId: string | undefined) {
  if (gameId === OTIX_DEFAULT_GAME_ID) {
    return { game: OTIX_DEFAULT_GAME, isLoading: false }
  }

  const isDesktop = hasDesktopAPI()
  const { data: localGame, isLoading: isLocalLoading } = useLocalGame(gameId)
  const { data: serverGamesData } = useServerGames()

  const serverFile = useMemo(() => {
    if (!gameId || !serverGamesData?.files?.length) return null
    if (gameId.startsWith('server-')) {
      const fid = gameId.replace('server-', '')
      return serverGamesData.files.find((f) => f.fileId === fid) || null
    }
    return serverGamesData.files.find((f) => f.catalogItem?.id === gameId) || null
  }, [gameId, serverGamesData?.files])

  // For desktop matched games, use the otix ID for catalog detail fetch.
  // Falls back to serverFile catalog id, or gameId directly if not a server- prefix.
  const catalogId =
    localGame?.data?.id ||
    localGame?.otixMediaId ||
    serverFile?.catalogItem?.id ||
    (gameId && !gameId.startsWith('server-') ? gameId : undefined)

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
        logoColorGuess: catalogSource.logoColorGuess as string | null | undefined,
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

  // Server game or web game without local DB entry
  if (catalogDetail || serverFile) {
    const title = catalogDetail?.title || serverFile?.catalogItem?.title || serverFile?.gameTitle || 'Game'
    const remoteGame: LocalGame = {
      id: gameId || serverFile?.fileId || catalogDetail?.id || '',
      title,
      platform: 'server' as const,
      exePath: '',
      installDir: '',
      iconUrl: catalogDetail?.iconUrl ?? undefined,
      posterUrl: catalogDetail?.posterUrl ?? undefined,
      otixMediaId: catalogDetail?.id || serverFile?.catalogItem?.id || undefined,
      otixMediaTitle: title,
      otixMediaSlug: catalogDetail?.slug || serverFile?.catalogItem?.slug || undefined,
      data: {
        id: catalogDetail?.id || serverFile?.catalogItem?.id || '',
        title,
        slug: catalogDetail?.slug || serverFile?.catalogItem?.slug || '',
        overview: catalogDetail?.overview || null,
        posterUrl: catalogDetail?.posterUrl ?? undefined,
        backdropUrl: catalogDetail?.backdropUrl ?? undefined,
        logoUrl: catalogDetail?.logoUrl ?? undefined,
        logoColorGuess: catalogDetail?.logoColorGuess ?? undefined,
        iconUrl: catalogDetail?.iconUrl ?? undefined,
        screenshots: (catalogDetail as unknown as Record<string, unknown>)?.screenshots as Game['screenshots'],
        genres: catalogDetail?.genres || [],
        involvedCompanies: catalogDetail?.involvedCompanies || [],
      } as Game,
    }
    return { game: remoteGame, isLoading }
  }

  return { game: undefined as LocalGame | undefined, isLoading }
}
