import { useMemo } from 'react'
import { useLocalGame, useLauncherVisibleGames } from '@/features/launcher/data/game-queries'
import { useGameDetail } from '@/features/launcher/data/queries'
import { useServerGames } from '@/features/downloads/use-server-downloads'
import { hasDesktopAPI } from '@/lib/desktop/api'
import { OTIX_DEFAULT_GAME, OTIX_DEFAULT_GAME_ID } from '@/features/launcher/data/otix-default-game'
import { isCatalogId } from '@/features/launcher/utils'
import {
  attachGroupToLocalGame,
  findGroupedServerGame,
  groupedServerGameToLocalGame,
} from '@/features/launcher/data/visible-games'
import type { LocalGame, Game } from '@/features/launcher/types'

export const useLauncherGame = (gameId: string | undefined) => {
  const isDefault = gameId === OTIX_DEFAULT_GAME_ID
  const isDesktop = hasDesktopAPI()
  const { data: localGame, isLoading: isLocalLoading } = useLocalGame(isDefault ? undefined : gameId)
  const { data: visibleGames = [] } = useLauncherVisibleGames()
  const { data: serverGamesData, isLoading: isServerGamesLoading } = useServerGames()

  const matchingVisible = useMemo(
    () => (!isDefault && gameId ? visibleGames.find((g) => g.id === gameId || g.otixMediaId === gameId || g.data?.id === gameId) : null),
    [isDefault, gameId, visibleGames],
  )

  const group = useMemo(
    () => (isDefault ? null : findGroupedServerGame(serverGamesData?.files, { gameId, local: localGame || matchingVisible })),
    [isDefault, gameId, localGame, matchingVisible, serverGamesData?.files],
  )
  const serverFile = group?.primary.file || null
  const groupedGame = useMemo(
    () => (group ? groupedServerGameToLocalGame(group) : null),
    [group],
  )

  const baseGame = localGame || matchingVisible || groupedGame

  // For catalog detail fetch, prioritize known catalog/otix id, or gameId only if it is a valid catalog id
  const catalogId = isDefault
    ? undefined
    : baseGame?.data?.id ||
      baseGame?.otixMediaId ||
      groupedGame?.otixMediaId ||
      serverFile?.catalogItem?.id ||
      (isCatalogId(gameId) ? gameId : undefined)

  const { data: catalogDetail, isLoading: isCatalogLoading } = useGameDetail(catalogId)

  // Server-only ids have no catalog id until /library/server-games returns.
  // Without this, the page flashes "not found" while that request is in flight.
  const waitingForServerGame =
    !isDefault &&
    Boolean(gameId?.startsWith('server-')) &&
    !baseGame &&
    isServerGamesLoading

  const isLoading = isDefault
    ? false
    : baseGame
      ? false
      : isDesktop
        ? isLocalLoading || waitingForServerGame || (Boolean(catalogId) && isCatalogLoading)
        : waitingForServerGame || (Boolean(catalogId) && isCatalogLoading)

  if (isDefault) {
    return { game: OTIX_DEFAULT_GAME, isLoading: false }
  }

  const withUpdates = baseGame
    ? (baseGame.platform === 'server' && !localGame && !matchingVisible ? baseGame : attachGroupToLocalGame(baseGame, group))
    : groupedGame

  // Merge catalog data into game — prefers data, falls back to otix* fields / catalog detail
  if (withUpdates) {
    const hasRichData = Boolean(withUpdates.data?.backdropUrl && withUpdates.data?.posterUrl)
    const catalogSource = (catalogDetail as Record<string, unknown> | null) ?? {}

    if (!hasRichData) {
      const richData: Game = {
        id: withUpdates.otixMediaId || withUpdates.data?.id || catalogDetail?.id || '',
        title: withUpdates.otixMediaTitle || withUpdates.data?.title || withUpdates.title,
        slug: withUpdates.otixMediaSlug || withUpdates.data?.slug || catalogDetail?.slug || '',
        overview: catalogDetail?.overview || withUpdates.data?.overview || null,
        posterUrl: (withUpdates.otixPosterUrl || catalogSource.posterUrl || withUpdates.data?.posterUrl) as string | undefined,
        backdropUrl: (withUpdates.otixBackdropUrl || catalogSource.backdropUrl || withUpdates.data?.backdropUrl) as string | undefined,
        textlessPosterUrl: (withUpdates.otixTextlessPosterUrl || catalogSource.textlessPosterUrl || withUpdates.data?.textlessPosterUrl) as string | null | undefined,
        logoUrl: (withUpdates.otixLogoUrl || catalogSource.logoUrl || withUpdates.data?.logoUrl) as string | undefined,
        logoColorGuess: catalogSource.logoColorGuess as string | null | undefined,
        iconUrl: (withUpdates.otixIconUrl || catalogSource.iconUrl || withUpdates.data?.iconUrl) as string | undefined,
        screenshots: (catalogSource.screenshots || withUpdates.data?.screenshots) as Game['screenshots'],
        genres: catalogDetail?.genres || withUpdates.data?.genres || [],
        involvedCompanies: catalogDetail?.involvedCompanies || withUpdates.data?.involvedCompanies || [],
        platforms: (catalogSource.platforms || withUpdates.data?.platforms) as Game['platforms'],
      }
      return {
        game: { ...withUpdates, data: richData } as LocalGame,
        isLoading,
      }
    }

    // Already has rich data — merge screenshots from catalog if newer
    if (catalogSource.screenshots && !withUpdates.data?.screenshots?.length) {
      return {
        game: {
          ...withUpdates,
          data: { ...withUpdates.data, screenshots: catalogSource.screenshots as Game['screenshots'] },
        } as LocalGame,
        isLoading,
      }
    }

    return { game: withUpdates, isLoading }
  }

  if (catalogDetail) {
    const title = catalogDetail.title || 'Game'
    const remoteGame: LocalGame = {
      id: gameId || catalogDetail.id,
      title,
      platform: 'server',
      exePath: '',
      installDir: '',
      iconUrl: catalogDetail.iconUrl ?? undefined,
      posterUrl: catalogDetail.posterUrl ?? undefined,
      otixMediaId: catalogDetail.id,
      otixMediaTitle: title,
      otixMediaSlug: catalogDetail.slug,
      data: {
        id: catalogDetail.id,
        title,
        slug: catalogDetail.slug,
        overview: catalogDetail.overview || null,
        posterUrl: catalogDetail.posterUrl ?? undefined,
        backdropUrl: catalogDetail.backdropUrl ?? undefined,
        logoUrl: catalogDetail.logoUrl ?? undefined,
        logoColorGuess: catalogDetail.logoColorGuess ?? undefined,
        iconUrl: catalogDetail.iconUrl ?? undefined,
        genres: catalogDetail.genres || [],
        involvedCompanies: catalogDetail.involvedCompanies || [],
        platforms: catalogDetail.platforms || [],
      },
    }
    return { game: remoteGame, isLoading }
  }

  return { game: undefined as LocalGame | undefined, isLoading }
}
