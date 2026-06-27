import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/old-features/auth'
import { useDownloads, useDownloadConfig } from '@/features/downloads/use-downloads'
import type { HypervisorConfirmResponse, Download, DownloadConfig } from '@/features/downloads/types'
import { useFeature } from '@/features/_config'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { setLocalGamesMapEntry, getLocalGamesMap } from '@/old-features/game-scanner/storage'
import { useInstallProgress } from '@/old-features/game-scanner/install-store'
import type { InstallStoreEntry } from '@/old-features/game-scanner/install-store'
import { isTitleMatch, mediaQueries } from '@media'

type LocalGame = import('@/old-features/game-scanner/types').LocalGame

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
  // Display data
  mediaTitle: string
  matchingScannedGame: LocalGame | null
  isoPath: string | null
  existingDownload: Download | undefined
  installEntry: InstallStoreEntry | undefined
  dlConfig: DownloadConfig | undefined
  errorMsg: string
  postProcessing: boolean
  searching: boolean
  isInstallerOpen: boolean
  scannedGames: LocalGame[]
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
  const { config: dlConfig } = useDownloadConfig(user?.id)
  const [searching, setSearching] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [postProcessing, setPostProcessing] = useState(false)
  const [isInstallerOpen, setIsInstallerOpen] = useState(false)
  const { data: scannedGames = [] } = useLocalGames()
  const [localGame, setLocalGame] = useState<LocalGame | null>(null)
  const [hvDialogOpen, setHvDialogOpen] = useState(false)
  const [hvCountdown, setHvCountdown] = useState(10)
  const [hvPending, setHvPending] = useState<HypervisorConfirmResponse | null>(null)
  const { installs: allInstalls } = useInstallProgress()

  const mediaTitle = data?.title || ''

  // ── Effect: match local game ──

  useEffect(() => {
    let currentLocal: LocalGame | null = null
    try {
      const map = getLocalGamesMap()
      currentLocal = map[mediaId] || null
      setLocalGame(currentLocal)
    } catch {
      setLocalGame(null)
    }

    if (!currentLocal && mediaTitle) {
      const match = scannedGames.find(g => g.data?.id === mediaId) ||
                    scannedGames.find(g => isTitleMatch(g.title, mediaTitle))
      if (match) {
        setLocalGamesMapEntry(mediaId, match)
        setLocalGame(match)
      }
    }
  }, [mediaId, mediaTitle, scannedGames])

  // ── Effect: hypervisor countdown ──

  useEffect(() => {
    if (!hvDialogOpen) {
      setHvCountdown(10)
      return
    }
    if (hvCountdown <= 0) {
      setHvDialogOpen(false)
      setErrorMsg('Hypervisor download cancelled (timeout).')
      return
    }
    const timer = setTimeout(() => setHvCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [hvDialogOpen, hvCountdown])

  // ── Derived / computed state ──

  const isDesktopMissingOrNotAdmin = !window.desktopAPI || !user?.isAdmin
  const dataMissing = !data

  const matchingScannedGame = scannedGames.find(g => g.data?.id === mediaId) || localGame
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
    isDesktopMissingOrNotAdmin ||
    (!downloadsEnabled && !matchingScannedGame)

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
    downloadStatus,
    downloadPercentage,
    downloadNzbName,
    hvDialogOpen,
    hvCountdown,
    hvPendingGameName,
    handlePlay,
    handleDownload,
    handleHvConfirm,
    handleHvDismiss,
    handleCancelDownload,
    handlePollQueue,
    handlePostProcess,
    setIsInstallerOpen,
  }
}
