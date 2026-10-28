import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@auth/hooks/use-auth'
import { useDownloads, useDownloadConfig } from '@/features/downloads/use-downloads'
import {
  useServerUsenetHistory,
  useServerUsenetQueue,
  useCancelServerQueueDownload,
  useNodeUsenetConfig,
  getAlternateNumeralQuery,
  usenetKeys,
} from '@/features/downloads/use-node-usenet'
import { useNodeProviders } from '@/features/downloads/use-node-providers'
import { findBestGameRelease } from '@/features/downloads/game-auto-match'
import {
  hasConfiguredDownloader,
  inferReleaseProtocol,
} from '@/features/downloads/provider-utils'
import {
  isSabnzbdConfigured,
  normalizeProwlarrRelease,
  releaseDownloadUrl,
} from '@/features/downloads/usenet-utils'
import { mediaRequestKeys } from '@/features/downloads/use-media-requests'
import { releaseMatchesSearchHint } from '@/features/downloads/release-parse'
import { apiClient } from '@/lib/api/client'
import { useToast } from '@ui/molecules/toast'
import type { ServerProwlarrRelease } from '@/features/downloads/usenet-types'
import {
  findCompletedServerDownload,
  matchServerGameFile,
  serverInstallCaption,
  completedDownloadKey,
  completedDownloadSize,
} from '@/features/downloads/server-availability'
import type { ServerDownloadHistoryItem, ServerSabnzbdQueueItem } from '@/features/downloads/usenet-types'
import {
  serverKeys,
  useServerGames,
  useRemoteDownloads,
  useScanGameServer,
  type ServerGameFile,
  useGameServers,
  type GameServer,
} from '@/features/downloads/use-server-downloads'
import type { RemoteDownloadProgress } from '@/lib/desktop/api'
import type { HypervisorConfirmResponse, Download, DownloadConfig } from '@/features/downloads/types'
import {
  gameInstallCompatibility,
  PREVIEW_INCOMPATIBLE_AS_AVAILABLE,
  type InstallCompatibility,
} from '@/features/downloads/os-compatibility'
import { useFeature } from '@/features/_config'
import { useLocalGames } from '@/features/launcher/data/game-queries'
import { setLocalGamesMapEntry, getLocalGamesMap } from '@/features/launcher/data/storage'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import type { InstallStoreEntry } from '@/features/launcher/types'
import { isTitleMatch } from '@media/utils'
import { mediaQueries } from '@media/queries/media-queries'
import { formatBytes } from '@/lib/utils'

type LocalGame = import('@/features/launcher/types').LocalGame

export interface DownloadGameState {
  hidden: boolean
  isInstalled: boolean
  isDownloading: boolean
  isCompleted: boolean
  isIsoAvailable: boolean
  isInstallingThis: boolean
  justInstalled: boolean
  isFailed: boolean
  downloadsEnabled: boolean
  canLocalDownload: boolean
  mediaId: string
  // Display data
  mediaTitle: string
  matchingScannedGame: LocalGame | null
  isoPath: string | null
  existingDownload: Download | undefined
  installEntry: InstallStoreEntry | undefined
  dlConfig: DownloadConfig | null
  errorMsg: string
  postProcessing: boolean
  searching: boolean
  isInstallerOpen: boolean
  scannedGames: LocalGame[]
  // Remote server game & transfer
  serverFile: ServerGameFile | null
  activeRemoteTransfer: RemoteDownloadProgress | null
  isRemoteDownloading: boolean
  isRemotePaused: boolean
  activeServerQueueItem: ServerSabnzbdQueueItem | null
  completedServerDownload: ServerDownloadHistoryItem | null
  availableOnServer: boolean
  indexingServerFile: boolean
  installCopy: { button: string; caption: string; title: string }
  installCompatibility: InstallCompatibility
  // Game servers
  activeServer: GameServer | null
  gameServers: GameServer[]
  hasGameServer: boolean
  // Download progress
  downloadStatus: string
  downloadPercentage: number
  downloadNzbName: string | null
  // Hypervisor
  hvDialogOpen: boolean
  hvCountdown: number
  hvPendingGameName: string | null
  // Actions
  handlePlay: () => Promise<void>
  handleDownload: () => Promise<void>
  handleRequestGame: (onNoMatch?: () => void) => Promise<void>
  requesting: boolean
  handleRemoteDownload: () => Promise<void>
  handleRemotePause: () => Promise<boolean | undefined>
  handleRemoteResume: () => Promise<boolean | undefined>
  handleRemoteCancel: () => Promise<boolean | undefined>
  handleCancelServerQueue: () => void
  handleHvConfirm: () => Promise<void>
  handleHvDismiss: () => void
  handleCancelDownload: () => void
  handlePollQueue: () => void
  handlePostProcess: () => Promise<void>
  setIsInstallerOpen: (open: boolean) => void
}

export function useDownloadGame(): DownloadGameState {
  const params = useParams({ strict: false }) as { mediaId?: string }
  const mediaId = params.mediaId || ''

  const { data } = useQuery(mediaQueries.detail('game', mediaId))
  const { user } = useAuth()
  const downloadsEnabled = useFeature('downloads')
  const { downloads, searchAndDownload, cancelDownload, pollQueue } = useDownloads(user?.id)
  const queryClient = useQueryClient()
  const { data: gameServers = [] } = useGameServers()
  const activeServer = gameServers.find((s) => s.isActive) || gameServers[0] || null
  const hasGameServer = !!activeServer
  const mediaTitle = data?.title || ''
  const { data: serverHistory = [] } = useServerUsenetHistory(activeServer?.id)
  const completedServerDownload = useMemo(
    () => findCompletedServerDownload(serverHistory, mediaId, mediaTitle),
    [serverHistory, mediaId, mediaTitle],
  )
  const { data: serverGamesData, refetch: refetchServerGames } = useServerGames({
    refetchInterval: completedServerDownload ? 8_000 : false,
  })
  const scanGameServer = useScanGameServer(activeServer?.id)
  const {
    activeTransfers,
    startDownload: startRemoteDownload,
    pauseDownload: pauseRemoteDownload,
    resumeDownload: resumeRemoteDownload,
    cancelDownload: cancelRemoteDownload,
  } = useRemoteDownloads()
  const { config: dlConfig } = useDownloadConfig(user?.id)
  const { data: serverQueue } = useServerUsenetQueue(activeServer?.id)
  const cancelServerQueue = useCancelServerQueueDownload(activeServer?.id)

  const [searching, setSearching] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [postProcessing, setPostProcessing] = useState(false)
  const [isInstallerOpen, setIsInstallerOpen] = useState(false)
  const { data: scannedGames = [] } = useLocalGames()
  const [hvDialogOpen, setHvDialogOpen] = useState(false)
  const [hvCountdown, setHvCountdown] = useState(10)
  const [hvPending, setHvPending] = useState<HypervisorConfirmResponse | null>(null)
  const { installs: allInstalls } = useInstallProgress()
  const scannedForNzo = useRef<string | null>(null)
  const completedKey = completedDownloadKey(completedServerDownload)
  const { toast } = useToast()
  const [requesting, setRequesting] = useState(false)
  const { data: providers } = useNodeProviders(activeServer?.id)
  const { data: usenetConfig } = useNodeUsenetConfig(activeServer?.id)
  const storedLocalGame = useMemo(() => {
    try {
      return getLocalGamesMap()[mediaId] || null
    } catch {
      return null
    }
  }, [mediaId])

  // ── Remote Server Games & Active Transfer Matching ──
  const serverFile = matchServerGameFile(serverGamesData?.files, mediaId, mediaTitle)
  const availableOnServer = !!serverFile || !!completedServerDownload
  const indexingServerFile = scanGameServer.isPending && !serverFile
  const installCopy = serverInstallCaption({
    serverName: serverFile?.serverName || activeServer?.name,
    filesize: serverFile?.filesize ?? completedDownloadSize(completedServerDownload),
    indexed: !!serverFile,
    formatBytes,
  })
  const installCompatibility = (() => {
    const actual = gameInstallCompatibility(data?.platforms)
    if (!PREVIEW_INCOMPATIBLE_AS_AVAILABLE || actual.compatible) return actual
    return { ...actual, compatible: true }
  })()

  const activeRemoteTransfer = activeTransfers.find(
    (t) =>
      (serverFile && t.fileId === serverFile.fileId) ||
      (mediaTitle && isTitleMatch(t.gameTitle, mediaTitle))
  ) || null

  const isRemoteDownloading = activeRemoteTransfer?.status === 'downloading'
  const isRemotePaused = activeRemoteTransfer?.status === 'paused'

  const activeServerQueueItem = useMemo(() => {
    if (!mediaTitle || !serverQueue?.items?.length) return null
    return (
      serverQueue.items.find((item) => releaseMatchesSearchHint(item.filename, mediaTitle)) ||
      null
    )
  }, [mediaTitle, serverQueue])

  useEffect(() => {
    if (!completedKey) return
    queryClient.invalidateQueries({ queryKey: serverKeys.games() })
  }, [completedKey, queryClient])

  useEffect(() => {
    if (!completedKey || serverFile || !activeServer?.id) return
    if (scannedForNzo.current === completedKey || scanGameServer.isPending) return
    scannedForNzo.current = completedKey
    scanGameServer.mutate()
  }, [activeServer?.id, completedKey, scanGameServer, serverFile])

  useEffect(() => {
    if (!storedLocalGame && mediaTitle) {
      const match =
        scannedGames.find(g => g.data?.id === mediaId) ||
        scannedGames.find(g => isTitleMatch(g.title, mediaTitle))
      if (match) {
        setLocalGamesMapEntry(mediaId, match)
      }
    }
  }, [mediaId, mediaTitle, scannedGames, storedLocalGame])

  // ── Effect: hypervisor countdown ──

  useEffect(() => {
    if (!hvDialogOpen) return
    const timer = setTimeout(() => {
      setHvCountdown((current) => {
        if (current <= 1) {
          setHvDialogOpen(false)
          setErrorMsg('Hypervisor download cancelled (timeout).')
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [hvDialogOpen, hvCountdown])

  // ── Derived / computed state ──

  const isDesktop = !!window.desktopAPI
  const canLocalDownload = isDesktop && downloadsEnabled
  const dataMissing = !data

  const matchingScannedGame =
    scannedGames.find(g => g.data?.id === mediaId) ||
    scannedGames.find(g => mediaTitle && isTitleMatch(g.title, mediaTitle)) ||
    storedLocalGame
  const isInstalled = !!(matchingScannedGame && matchingScannedGame.platform !== 'iso')

  const existingDownload = downloads.find(d => d.mediaItemId === mediaId)
  const isDownloading = !!(existingDownload && existingDownload.status !== 'completed' && existingDownload.status !== 'failed')
  const isCompleted = existingDownload?.status === 'completed'
  const isFailed = !!(downloadsEnabled && existingDownload?.status === 'failed')
  const isIsoAvailable = !!(matchingScannedGame && matchingScannedGame.platform === 'iso') || !!(existingDownload?.isoPath) || !!(isCompleted && existingDownload?.isoPath)
  const isoPath = existingDownload?.isoPath || (matchingScannedGame?.platform === 'iso' ? matchingScannedGame.exePath : null) || null

  const installEntry = isoPath
    ? allInstalls.find((i) => i.isoPath?.toLowerCase() === isoPath.toLowerCase())
    : undefined
  const isInstallingThis = installEntry?.active === true
  const justInstalled = !installEntry?.active && installEntry?.result?.success === true

  const downloadStatus = existingDownload?.status ?? ''
  const downloadPercentage = existingDownload?.percentage ?? 0
  const downloadNzbName = existingDownload?.nzbName ?? null

  const hvPendingGameName = hvPending?.gameName ?? null

  // ── Hidden guard ──
  const hidden =
    dataMissing ||
    (
      !canLocalDownload &&
      !matchingScannedGame &&
      !serverFile &&
      !activeRemoteTransfer &&
      !hasGameServer &&
      !availableOnServer
    )

  // ── Handlers ──

  const handleDownload = async () => {
    setSearching(true)
    setErrorMsg('')
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle)
    if ('hypervisorAvailable' in result) {
      setHvPending(result)
      setHvCountdown(10)
      setHvDialogOpen(true)
    } else if ('error' in result) {
      setErrorMsg(result.error)
    }
    setSearching(false)
  }

  const handleRequestGame = async (onNoMatch?: () => void) => {
    if (!activeServer?.id || !mediaTitle) return
    setRequesting(true)
    setErrorMsg('')

    try {
      const q = mediaTitle.trim()
      const queries = [q]
      const alt = getAlternateNumeralQuery(q)
      if (alt && alt.toLowerCase() !== q.toLowerCase()) {
        queries.push(alt)
      }

      const results = await Promise.all(
        queries.map(async (searchQuery, idx) => {
          try {
            const { data: resData } = await apiClient.get<unknown>(
              `/library/servers/${activeServer.id}/usenet/search`,
              { params: { query: searchQuery } },
            )
            return Array.isArray(resData) ? resData : []
          } catch (err) {
            if (idx === 0) throw err
            return []
          }
        }),
      )

      const seen = new Set<string>()
      const releases: ServerProwlarrRelease[] = []
      for (const row of results.flat()) {
        const item = normalizeProwlarrRelease(row)
        if (item && !seen.has(item.guid)) {
          seen.add(item.guid)
          releases.push(item)
        }
      }

      const torrentConfigured = hasConfiguredDownloader(providers?.downloaders, 'torrent')
      const usenetConfigured =
        hasConfiguredDownloader(providers?.downloaders, 'usenet') ||
        isSabnzbdConfigured(usenetConfig?.sabnzbd)

      const releaseYear = (data as { releaseDate?: string })?.releaseDate
        ? new Date((data as { releaseDate: string }).releaseDate).getFullYear()
        : (data as { year?: number })?.year ?? null

      const match = findBestGameRelease(
        releases,
        {
          title: mediaTitle,
          year: releaseYear && !isNaN(releaseYear) ? releaseYear : null,
          mediaItemId: mediaId,
        },
        { torrentConfigured, usenetConfigured },
      )

      if (!match) {
        toast({
          title: 'No optimal release found',
          description: `Could not auto-match an optimal release for “${mediaTitle}”. Opening indexer search…`,
          variant: 'default',
        })
        onNoMatch?.()
        return
      }

      const downloadUrl = releaseDownloadUrl(match.baseRelease)
      const protocol = inferReleaseProtocol(match.baseRelease)
      const dlRes = await apiClient.post<{ nzo_id?: string }>(
        `/library/servers/${activeServer.id}/usenet/download`,
        {
          title: match.baseRelease.title,
          download_url: downloadUrl,
          category: 'games',
          protocol,
          media_item_id: mediaId || null,
          size: match.baseRelease.size || null,
        },
      )

      let updatesQueued = 0
      for (const update of match.companionUpdates) {
        const updUrl = releaseDownloadUrl(update)
        try {
          await apiClient.post(
            `/library/servers/${activeServer.id}/usenet/download`,
            {
              title: update.title,
              download_url: updUrl,
              category: 'games',
              protocol: inferReleaseProtocol(update),
              media_item_id: mediaId || null,
              size: update.size || null,
            },
          )
          updatesQueued += 1
        } catch {
          // non-fatal
        }
      }

      try {
        await apiClient.post('/library/requests', {
          server_id: activeServer.id,
          service: protocol === 'torrent' ? 'torrent' : 'usenet',
          media_type: 'game',
          title: mediaTitle,
          year: releaseYear && !isNaN(releaseYear) ? releaseYear : null,
          status: 'downloading',
          media_item_id: mediaId ? Number(mediaId) || null : null,
          poster_url: (data as { posterUrl?: string })?.posterUrl || null,
          external_id: dlRes.data?.nzo_id || match.baseRelease.guid,
        })
      } catch {
        // non-fatal
      }

      queryClient.invalidateQueries({ queryKey: usenetKeys.queue(activeServer.id) })
      queryClient.invalidateQueries({ queryKey: usenetKeys.history(activeServer.id) })
      queryClient.invalidateQueries({ queryKey: mediaRequestKeys.all })

      toast({
        title: updatesQueued > 0 ? 'Game and updates queued' : 'Game request queued',
        description:
          updatesQueued > 0
            ? `Sent “${match.baseRelease.title}” and ${updatesQueued} update${updatesQueued === 1 ? '' : 's'} to ${activeServer.name}.`
            : `Sent “${match.baseRelease.title}” to ${activeServer.name}.`,
        variant: 'success',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request game'
      setErrorMsg(msg)
      toast({
        title: 'Request failed',
        description: msg,
        variant: 'error',
      })
    } finally {
      setRequesting(false)
    }
  }

  const handleHvConfirm = async () => {
    setHvDialogOpen(false)
    setHvPending(null)
    setSearching(true)
    setErrorMsg('')
    const result = await searchAndDownload(user!.id, mediaId, mediaTitle, true)
    if ('hypervisorAvailable' in result || 'error' in result) {
      setErrorMsg(result.error ?? '')
    }
    setSearching(false)
  }

  const handleHvDismiss = () => {
    setHvDialogOpen(false)
    setHvPending(null)
    setErrorMsg('Hypervisor download cancelled.')
  }

  const handlePlay = async () => {
    if (installEntry?.result?.gameExe) {
      try {
        await window.desktopAPI!.launchGame({
          exePath: installEntry.result.gameExe,
          installDir: installEntry.result.installDir,
          title: installEntry.gameTitle ?? 'Game',
          id: installEntry.result.installDir,
          platform: 'pc',
        } as Parameters<NonNullable<typeof window.desktopAPI>['launchGame']>[0])
      } catch (e) {
        console.error('Failed to launch:', e)
      }
    } else if (matchingScannedGame) {
      try {
        await window.desktopAPI!.launchGame(matchingScannedGame)
      } catch (err) {
        console.error('Failed to launch game:', err)
      }
    }
  }

  const handleRemoteDownload = async () => {
    setErrorMsg('')
    if (!installCompatibility.compatible) {
      setErrorMsg(installCompatibility.title)
      return
    }
    let file = serverFile
    if (!file && availableOnServer && activeServer?.id) {
      try {
        await scanGameServer.mutateAsync()
        const fresh = await refetchServerGames()
        file = matchServerGameFile(fresh.data?.files, mediaId, mediaTitle)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(msg)
        return
      }
    }
    if (!file) {
      setErrorMsg('The game is on the server but has not been indexed yet. Try Install again in a moment.')
      return
    }
    try {
      await startRemoteDownload(file, mediaId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
    }
  }

  const handleRemotePause = async () => {
    if (activeRemoteTransfer) {
      return await pauseRemoteDownload(activeRemoteTransfer.id)
    }
  }

  const handleRemoteResume = async () => {
    if (activeRemoteTransfer) {
      return await resumeRemoteDownload(activeRemoteTransfer.id)
    }
  }

  const handleRemoteCancel = async () => {
    if (activeRemoteTransfer) {
      return await cancelRemoteDownload(activeRemoteTransfer.id)
    }
  }

  const handleCancelServerQueue = () => {
    if (activeServerQueueItem) {
      cancelServerQueue.mutate(activeServerQueueItem.nzo_id)
    }
  }

  const handleCancelDownload = () => {
    if (existingDownload) {
      cancelDownload(existingDownload.id)
    }
  }

  const handlePollQueue = () => {
    pollQueue()
  }

  const handlePostProcess = async () => {
    setPostProcessing(true)
    try {
      if (existingDownload && dlConfig) {
        await window.desktopAPI!.downloadsPostProcess(
          existingDownload.id,
          dlConfig.id,
          dlConfig.sabnzbdCompletePath ?? undefined,
          dlConfig.downloadPath ?? undefined,
        )
      }
      await pollQueue()
    } finally {
      setPostProcessing(false)
    }
  }

  return {
    hidden,
    isInstalled,
    isDownloading,
    isCompleted,
    isIsoAvailable,
    isInstallingThis,
    justInstalled,
    isFailed,
    downloadsEnabled,
    mediaId,
    mediaTitle,
    matchingScannedGame,
    isoPath,
    existingDownload,
    installEntry,
    dlConfig,
    errorMsg,
    postProcessing,
    searching,
    isInstallerOpen,
    scannedGames,
    canLocalDownload,
    activeServer,
    gameServers,
    hasGameServer,
    serverFile,
    activeRemoteTransfer,
    isRemoteDownloading,
    isRemotePaused,
    activeServerQueueItem,
    completedServerDownload,
    availableOnServer,
    indexingServerFile,
    installCopy,
    installCompatibility,
    downloadStatus,
    downloadPercentage,
    downloadNzbName,
    hvDialogOpen,
    hvCountdown,
    hvPendingGameName,
    handlePlay,
    handleDownload,
    handleRequestGame,
    requesting,
    handleRemoteDownload,
    handleRemotePause,
    handleRemoteResume,
    handleRemoteCancel,
    handleCancelServerQueue,
    handleHvConfirm,
    handleHvDismiss,
    handleCancelDownload,
    handlePollQueue,
    handlePostProcess,
    setIsInstallerOpen,
  }
}
