import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { Cloud, RefreshCw, AlertCircle } from 'lucide-react'
import { useLauncherGame } from '@/features/games/hooks/use-launcher-game'
import { useSaveLocations } from '@/features/games/games-queries'
import { getDesktopAPI } from '@/lib/desktop-api'
import { API_BASE_URL } from '@/lib/api-client'

function getErrorMessage(err: unknown, fallback = 'An error occurred.'): string {
  return err instanceof Error ? err.message : typeof err === 'string' ? err : fallback
}

interface CloudSettings {
  gameId: string
  autoSync: boolean
  lastSyncAt: string | null
  isPathConfirmed: boolean
  confirmedPath: string | null
}

interface SaveLocationEntry {
  platform: string
  pathPattern: string
}

interface ServerLocations {
  verified?: SaveLocationEntry[]
  suggested?: SaveLocationEntry[]
}

interface UseCloudSyncOptions {
  gameId: string | null
  gameTitle: string
  serverLocations: ServerLocations | undefined
  refetchServerLocations: () => void
}

function useCloudSync({ gameId, gameTitle, serverLocations, refetchServerLocations }: UseCloudSyncOptions) {
  const [cloudSettings, setCloudSettings] = useState<CloudSettings | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [detectedPath, setDetectedPath] = useState<string | null>(null)
  const [overridePath, setOverridePath] = useState<string | null>(null)
  const [resolvingServerPaths, setResolvingServerPaths] = useState(false)
  const [confirmingPath, setConfirmingPath] = useState(false)
  const autoAssignedGames = useRef(new Set<string>())

  const api = getDesktopAPI()

  useEffect(() => {
    if (!gameId || !api) return
    setCloudSettings(null)
    setSyncError(null)
    setSuccessMsg(null)
    api.saveGetCloudSettings(gameId)
      .then((settings: CloudSettings | null) => { setCloudSettings(settings) })
      .catch((err: unknown) => { console.error('Failed to get cloud settings', err) })
  }, [gameId, api])

  useEffect(() => {
    if (!gameId || !api || !cloudSettings) return
    if (autoAssignedGames.current.has(gameId)) return
    autoAssignedGames.current.add(gameId)

    let cancelled = false
    setResolvingServerPaths(true)

    ;(async () => {
      try {
        const discoverRes = await api.saveDiscoverForGame(gameId, gameTitle)
        if (cancelled) return
        const localDetected = (discoverRes.detectedPaths as string[])?.[0] || null

        const override = await api.saveGetOverride(gameId)
        if (cancelled) return
        const overridePathVal = override?.userPath || null
        setOverridePath(overridePathVal)

        const currentPlatform = api.platform || 'win32'
        const platformKey = currentPlatform === 'win32' ? 'windows' : currentPlatform === 'darwin' ? 'mac' : 'linux'

        let verifiedPathVal: string | null = null
        if (serverLocations?.verified) {
          const verifiedPatterns = serverLocations.verified
            .filter((loc: SaveLocationEntry) => loc.platform === platformKey)
            .map((loc: SaveLocationEntry) => loc.pathPattern)
          if (verifiedPatterns.length > 0) {
            const resolved = await api.saveResolvePathPatterns(verifiedPatterns)
            if (cancelled) return
            if (resolved && resolved.length > 0) {
              verifiedPathVal = resolved[0]
            }
          }
        }

        let suggestedPathVal: string | null = null
        if (serverLocations?.suggested) {
          const suggestedPatterns = serverLocations.suggested
            .filter((loc: SaveLocationEntry) => loc.platform === platformKey)
            .map((loc: SaveLocationEntry) => loc.pathPattern)
          if (suggestedPatterns.length > 0) {
            const resolved = await api.saveResolvePathPatterns(suggestedPatterns)
            if (cancelled) return
            if (resolved && resolved.length > 0) {
              suggestedPathVal = resolved[0]
            }
          }
        }

        let candidate: string | null = null
        if (overridePathVal) {
          candidate = overridePathVal
        } else if (verifiedPathVal) {
          candidate = verifiedPathVal
        } else if (localDetected) {
          candidate = localDetected
        } else if (suggestedPathVal) {
          candidate = suggestedPathVal
        }

        setDetectedPath(candidate)

        if (candidate && !cloudSettings.isPathConfirmed) {
          setConfirmingPath(true)
          const token = localStorage.getItem('otix-access-token') || ''
          await api.saveConfirmPath(gameId, candidate, API_BASE_URL, token ? `Bearer ${token}` : '')
          if (cancelled) return
          const updated = await api.saveGetCloudSettings(gameId)
          if (cancelled) return
          setCloudSettings(updated || null)
          setSuccessMsg("Save path automatically detected and confirmed!")
          refetchServerLocations()
        }
      } catch (err) {
        console.error('Failed in path detection/assignment', err)
      } finally {
        if (!cancelled) {
          setResolvingServerPaths(false)
          setConfirmingPath(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [gameId, serverLocations, cloudSettings, confirmingPath, refetchServerLocations, api])

  useEffect(() => {
    if (!api) return
    const unsubscribe = api.onGameEnded(async (data: { gameId?: string; gameTitle?: string }) => {
      const gid = data?.gameId
      const gTitle = data?.gameTitle || 'Game'
      if (!gid) return
      try {
        const settings = await api.saveGetCloudSettings(gid)
        if (settings && settings.autoSync) {
          const token = localStorage.getItem('otix-access-token') || ''
          await api.saveSyncCloud(gid, gTitle, 'default', API_BASE_URL, token ? `Bearer ${token}` : '')
          if (gid === gid) {
            const updated = await api.saveGetCloudSettings(gid)
            setCloudSettings(updated)
          }
        }
      } catch (err) {
        console.error(`[AutoSync] Auto-sync failed for game: ${gid}`, err)
      }
    })
    return () => { unsubscribe() }
  }, [gameId, api])

  const handleToggleAutoSync = useCallback(async (checked: boolean) => {
    if (!gameId || !api) return
    try {
      await api.saveSetCloudSettings(gameId, checked)
      setCloudSettings((prev) => prev ? { ...prev, autoSync: checked } : null)
    } catch (err: unknown) {
      console.error('Failed to set cloud settings', err)
    }
  }, [gameId, api])

  const handleConfirmPath = useCallback(async (pathUrl: string) => {
    if (!gameId || !api) return
    setConfirmingPath(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      await api.saveConfirmPath(gameId, pathUrl, API_BASE_URL, token ? `Bearer ${token}` : '')
      setSuccessMsg("Save location confirmed successfully!")
      const updated = await api.saveGetCloudSettings(gameId)
      setCloudSettings(updated)
      refetchServerLocations()
    } catch (err: unknown) {
      console.error('Failed to confirm path', err)
      setSyncError(getErrorMessage(err, 'Failed to confirm save path.'))
    } finally {
      setConfirmingPath(false)
    }
  }, [gameId, api, refetchServerLocations])

  const handleSelectFolder = useCallback(async () => {
    if (!gameId || !api) return
    try {
      const selected = await api.saveSelectOverridePath()
      if (selected) {
        await api.saveSetOverride(gameId, selected)
        setOverridePath(selected)
        setDetectedPath(selected)
        const token = localStorage.getItem('otix-access-token') || ''
        await api.saveConfirmPath(gameId, selected, API_BASE_URL, token ? `Bearer ${token}` : '')
        const updated = await api.saveGetCloudSettings(gameId)
        setCloudSettings(updated)
        setSuccessMsg("Save folder selected and confirmed successfully!")
        refetchServerLocations()
      }
    } catch (err: unknown) {
      console.error('Failed to select override path', err)
      setSyncError(getErrorMessage(err, 'Failed to confirm selected folder.'))
    }
  }, [gameId, api, refetchServerLocations])

  const handleClearOverride = useCallback(async () => {
    if (!gameId || !api) return
    try {
      await api.saveClearOverride(gameId)
      setOverridePath(null)
      setSuccessMsg("Custom path override cleared.")
      const updated = await api.saveGetCloudSettings(gameId)
      setCloudSettings(updated)
    } catch (err) {
      console.error('Failed to clear override', err)
    }
  }, [gameId, api])

  const handleSyncNow = useCallback(async () => {
    if (!gameId || !api) return
    if (!cloudSettings?.isPathConfirmed) {
      setSyncError("Please confirm your save folder location first before syncing.")
      return
    }
    setSyncing(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      const res = await api.saveSyncCloud(gameId, gameTitle, 'default', API_BASE_URL, token ? `Bearer ${token}` : '')
      if (res.success) {
        setSuccessMsg(res.message || 'Sync successful!')
        const updated = await api.saveGetCloudSettings(gameId)
        setCloudSettings(updated)
      } else {
        setSyncError(res.message || 'Sync failed.')
      }
    } catch (err: unknown) {
      console.error('Sync failed', err)
      setSyncError(getErrorMessage(err, 'An error occurred during synchronization.'))
    } finally {
      setSyncing(false)
    }
  }, [gameId, gameTitle, api, cloudSettings?.isPathConfirmed])

  return {
    cloudSettings,
    syncing,
    syncError,
    successMsg,
    detectedPath,
    overridePath,
    confirmingPath,
    resolvingServerPaths,
    handleToggleAutoSync,
    handleConfirmPath,
    handleSelectFolder,
    handleClearOverride,
    handleSyncNow,
  }
}

export function LauncherCloudSyncStat() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { game: g } = useLauncherGame(gameId)
  const mediaId = g?.data?.id
  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(mediaId)
  const sync = useCloudSync({
    gameId: gameId || '',
    gameTitle: g?.data?.title || g?.title || '',
    serverLocations,
    refetchServerLocations,
  })

  const cloudIcon = sync.syncing
    ? <RefreshCw size={11} className="animate-spin text-blue-400" />
    : sync.syncError
    ? <AlertCircle size={11} className="text-red-400" />
    : sync.cloudSettings?.isPathConfirmed
    ? <Cloud size={11} className="text-emerald-400" />
    : <Cloud size={11} className="text-white/30" />

  const cloudTitle = sync.syncing
    ? 'Syncing...'
    : sync.syncError
    ? 'Sync error'
    : sync.cloudSettings?.lastSyncAt
    ? `Synced ${new Date(sync.cloudSettings.lastSyncAt).toLocaleTimeString()}`
    : 'Cloud saves'

  return (
    <>
      <div className="w-px self-stretch bg-white/15" />
      <button
        onClick={sync.handleSyncNow}
        disabled={sync.syncing || !sync.cloudSettings?.isPathConfirmed}
        className="flex items-center justify-center min-w-9 rounded-lg hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40 active:scale-95"
        title={cloudTitle}
      >
        {cloudIcon}
      </button>
    </>
  )
}
