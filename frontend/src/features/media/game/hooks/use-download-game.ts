import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/old-features/auth'
import { useDownloads, useDownloadConfig } from '@/features/downloads/use-downloads'
import { useServerUsenetHistory, useServerUsenetQueue, useCancelServerQueueDownload } from '@/features/downloads/use-server-usenet'
import { releaseMatchesSearchHint } from '@/features/downloads/release-parse'
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
  type InstallCompatibility,
} from '@/features/downloads/os-compatibility'
import { useFeature } from '@/features/_config'
import { useLocalGames } from '@/features/launcher/data/game-queries'
import { setLocalGamesMapEntry, getLocalGamesMap } from '@/features/launcher/data/storage'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import type { InstallStoreEntry } from '@/features/launcher/types'
import { isTitleMatch, mediaQueries } from '@media'
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
  const installCompatibility = gameInstallCompatibility(data?.platforms)

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
  const canLocalDownload = isDesktop && !!user?.isAdmin && downloadsEnabled
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
