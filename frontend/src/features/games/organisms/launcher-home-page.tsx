/* ── LauncherHomePage — fullscreen game launcher driven by real database & scanner data ── */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import {
  Gamepad2,
  Scan,
  HardDrive,
  Play,
  Plus,
  Search,
  Menu,
  ChevronRight,
  Sparkles,
  Cloud,
  Link2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Folder,
  Check,
  Disc,
  Loader2,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useDesktopPlatform } from '@/lib/desktop-platform'
import { useAuth } from '@/features/auth/auth-provider'
import { API_BASE_URL } from '@/lib/api-client'
import {
  getScannedGames,
  setScannedGames,
  getScanPaths,
  getIsoPaths,
  hasDesktopAPI,
  filterRejectedSuggestions,
  rejectSuggestion
} from '@/features/games/scanner/storage'
import type { DetectedGame } from '@/features/games/scanner/types'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/games/scanner/queries'
import { usePopularGames, useGameDetail, useSaveLocations } from '@/features/games/games-queries'
import { useClaimGame } from '@/features/library/library-queries'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useNavigation } from '@navigation/providers/navigation-provider'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'
import { useInstallProgress } from '@/features/game-scanner/install-store'

/* ── Types ── */

interface DisplayGame {
  id: string
  title: string
  description?: string
  backdropUrl?: string
  posterUrl: string | null
  iconUrl?: string
  logoUrl?: string
  badge?: string
  playtime: string
  achievements: string
  isDefault: boolean // false if local scanned, true if popular catalog fallback
  platform: 'steam' | 'pc' | 'iso' | 'epic' | 'gog' | 'battlenet' | 'ubisoft' | 'ea' | 'riot' | 'xbox' | 'itch'
  exePath?: string
  installDir?: string
  isInstalled?: boolean
  otixMediaId?: string
  rawGame?: DetectedGame
}

interface DiskInfo {
  drive: string
  total?: number
  used: number
  free: number
}

/* ── Web Preview Banner ── */

function WebPreviewBanner() {
  const isDesktop = typeof window !== 'undefined' && !!(window as any).desktopAPI
  if (isDesktop) return null
  return (
    <div className="absolute top-4 left-[92px] right-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 z-30 backdrop-blur-md">
      <div className="flex items-center gap-1.5">
        <span className="flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span><strong>Web Preview:</strong> Scans, play actions, and storage details are simulated. Run in the desktop app for native folder launching.</span>
      </div>
    </div>
  )
}

/* ── GamePickerThumb — icon URL preferred, poster URL fallback ── */

function GamePickerThumb({ icon, poster, alt }: { icon?: string | null; poster?: string | null; alt: string }) {
  const src = icon || poster
  return (
    <div className="w-full h-full relative">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5">
          <Gamepad2 size={14} className="opacity-30" />
        </div>
      )}
    </div>
  )
}

/* ── Fullscreen LauncherHomePage ── */

export function LauncherHomePage() {
  const navigate = useNavigate()
  const { isDesktop } = useDesktopPlatform()
  const { toast } = useToast()
  const { toggle: toggleNav } = useNavigation()

  const [localGames, setLocalGames] = useState<DetectedGame[]>(() => getScannedGames())
  // Detect OS for ISO install hint
  const osName = useMemo(() => {
    const p = typeof navigator !== 'undefined' ? navigator.platform.toLowerCase() : ''
    if (p.includes('mac')) return 'macOS'
    if (p.includes('win')) return 'Windows'
    if (p.includes('linux')) return 'Linux'
    return 'PC'
  }, [])
  // Re-sync from cache after DB loads or when games are updated elsewhere
  useEffect(() => {
    const reload = () => setLocalGames(getScannedGames())
    const timerId = setTimeout(reload, 100) // give loadFromDatabase() time
    const onGamesUpdated = () => { clearTimeout(timerId); reload() }
    window.addEventListener('games:updated', onGamesUpdated)
    return () => {
      clearTimeout(timerId)
      window.removeEventListener('games:updated', onGamesUpdated)
    }
  }, [])
  const [scanning, setScanning] = useState(false)
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null)
  const [localPlaytime, setLocalPlaytime] = useState<{ totalMinutes: number; sessionCount: number; lastPlayed: number | null } | null>(null)

  // Fetch local playtime from Electron game detector when active game changes
  useEffect(() => {
    setLocalPlaytime(null)
    if (!activeGame || !isDesktop) return
    const api = (window as any).desktopAPI
    if (!api?.getPlaytimeForGame) return
    const gameId = activeGame.rawGame?.id || activeGame.id
    api.getPlaytimeForGame(gameId).then(setLocalPlaytime).catch(() => setLocalPlaytime(null))
  }, [activeGame?.id, isDesktop])

  const { activeInstalls, cancelInstall, installs } = useInstallProgress()

  // When ISO install completes, refresh localGames from cache (markGameInstalled already updated it)
  const prevCompletedRef = useRef(0)
  useEffect(() => {
    const fresh = installs.filter(i => !i.active && i.result?.success).length
    if (fresh > prevCompletedRef.current) {
      setLocalGames(getScannedGames())
      prevCompletedRef.current = fresh
    }
  }, [installs])

  // Direct handler called by IsoInstallerModal when install succeeds
  const handleInstallComplete = useCallback((isoPath: string, installDir: string, gameExe: string | null) => {
    const normIso = isoPath.replace(/\\/g, '/').toLowerCase()
    setLocalGames(prev => {
      const updated = prev.map(g => {
        const normExe = g.exePath.replace(/\\/g, '/').toLowerCase()
        if (normExe === normIso) {
          return {
            ...g,
            platform: 'pc' as const,
            exePath: gameExe ?? g.exePath,
            installDir,
          }
        }
        return g
      })
      setScannedGames(updated)
      return updated
    })
  }, [])

  // Selection states
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [shelfTab, setShelfTab] = useState<'popular' | 'downloaded' | 'rated'>('popular')
  const [isInstallerOpen, setIsInstallerOpen] = useState(false)



  // Real Queries
  const { data: popularGames = [] } = usePopularGames()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const claimMutation = useClaimGame()

  // Match all local games against catalog on mount — refreshes metadata
  useEffect(() => {
    if (localGames.length === 0) return
    matchMutation.mutateAsync(localGames).then((matched) => {
      if (matched?.length) {
        const filtered = filterRejectedSuggestions(matched)
        // Preserve install status from current cache (avoids race with install completion)
        const current = getScannedGames()
        const merged = filtered.map(g => {
          const existing = current.find(c => c.id === g.id || c.exePath === g.exePath)
          if (existing && existing.platform !== g.platform && existing.platform !== 'iso') {
            return { ...g, platform: existing.platform, exePath: existing.exePath, installDir: existing.installDir }
          }
          return g
        })
        setLocalGames(merged)
        setScannedGames(merged)
        syncMutation.mutate(merged)
      }
    }).catch(() => { })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch disk space
  useEffect(() => {
    const api = (window as any).desktopAPI
    if (!isDesktop || !api?.getDiskSpace) return
    api.getDiskSpace()
      .then((drives: DiskInfo[]) => {
        if (drives.length > 0) setDiskInfo(drives[0])
      })
      .catch(() => { })
  }, [isDesktop])

  // Map real scanned games & popular catalog fallbacks to display games
  const displayGames = useMemo<DisplayGame[]>(() => {
    if (localGames.length > 0) {
      // User has scanned local games — use real catalog data where available
      return localGames.map((g) => {
        const platformLabel = g.platform.toUpperCase()
        const isMatched = !!g.otixMediaId
        const matchLabel = isMatched ? '✓ Matched' : (g.otixMatchSuggestion ? '⚠ Suggestion' : 'Unmatched')

        return {
          id: g.id,
          title: g.otixMediaTitle || g.title,
          posterUrl: g.otixPosterUrl || g.posterUrl || null,
          backdropUrl: g.otixBackdropUrl || undefined,
          iconUrl: g.otixIconUrl || g.iconUrl || undefined,
          logoUrl: g.otixLogoUrl || undefined,
          badge: `${platformLabel} · ${matchLabel}`,
          playtime: '—',
          achievements: isMatched ? 'Owned' : '—',
          isDefault: false,
          platform: g.platform,
          exePath: g.exePath,
          installDir: g.installDir,
          isInstalled: !!g.exePath && g.platform !== 'iso',
          otixMediaId: g.otixMediaId || undefined,
          rawGame: g
        }
      })
    } else {
      // No local games — show real popular catalog games from the database
      return popularGames.slice(0, 10).map((p) => ({
        id: p.id,
        title: p.title,
        posterUrl: p.posterUrl || null,
        backdropUrl: p.backdropUrl || undefined,
        logoUrl: p.logoUrl || undefined,
        iconUrl: p.iconUrl || undefined,
        badge: p.avgRating
          ? `★ ${p.avgRating.toFixed(1)} · ${p.ratingCount.toLocaleString()} ratings`
          : p.popularity > 200 ? 'Popular' : 'Featured',
        playtime: '—',
        achievements: p.avgRating ? `${Math.round(p.avgRating * 10)}%` : '—',
        isDefault: true,
        platform: 'pc',
        otixMediaId: p.id
      }))
    }
  }, [localGames, popularGames])

  // Picker sidebar: matched games only, installed first
  const pickerGames = useMemo<DisplayGame[]>(
    () => {
      const games = displayGames.filter((g) => !!g.otixMediaId)
      return [...games].sort((a, b) => {
        // Installed games first
        if (a.isInstalled && !b.isInstalled) return -1
        if (!a.isInstalled && b.isInstalled) return 1
        // Then by original order
        return 0
      })
    },
    [displayGames],
  )

  // Select first game automatically if activeGameId is null or unlisted
  useEffect(() => {
    if (!activeGameId && pickerGames.length > 0) {
      setActiveGameId(pickerGames[0].id)
    }
    // Fall back to picker[0] if active game was removed (e.g. after matching)
    if (activeGameId && pickerGames.length > 0 && !pickerGames.find((g) => g.id === activeGameId)) {
      setActiveGameId(pickerGames[0].id)
    }
  }, [pickerGames, activeGameId])

  // Find active game details — look across full display set for the active ID
  const activeGame = useMemo<DisplayGame | null>(() => {
    if (!activeGameId) return pickerGames[0] || null
    return displayGames.find((g) => g.id === activeGameId) || pickerGames[0] || null
  }, [displayGames, pickerGames, activeGameId])

  const activeInstall = useMemo(() => {
    const activePath = activeGame?.rawGame?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find(i => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, activeGame])

  // ── Install verification: check if ISO game has pre-existing files in installDir ──
  const [foundInstall, setFoundInstall] = useState<{ exePath: string; installKey: string } | null>(null)
  const checkedGameDirs = useRef(new Set<string>(
    (() => { try { return JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]') } catch { return [] } })()
  ))

  useEffect(() => {
    if (!activeGame) { setFoundInstall(null); return }
    // Only check unmatched ISO games not yet installed
    if (activeGame.platform !== 'iso' || activeGame.isInstalled) { setFoundInstall(null); return }
    if (activeGame.otixMediaId) { setFoundInstall(null); return }
    const dir = activeGame.rawGame?.installDir || activeGame.installDir
    if (!dir) { setFoundInstall(null); return }
    // Use ISO path as key — stable across sessions unlike game ID
    const rawKey = activeGame.rawGame?.exePath || activeGame.exePath || dir
    const installKey = rawKey.replace(/\\/g, '/').toLowerCase()
    if (checkedGameDirs.current.has(installKey)) { setFoundInstall(null); return }

    const api = (window as any).desktopAPI
    if (!api?.checkInstallDir) return
    api.checkInstallDir(dir).then((r: { found: boolean; gameExe: string | null }) => {
      if (r.found && r.gameExe && !checkedGameDirs.current.has(installKey)) {
        checkedGameDirs.current.add(installKey)
        try {
          const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
          if (dismissed.includes(installKey)) { setFoundInstall(null); return }
        } catch {}
        setFoundInstall({ exePath: r.gameExe, installKey })
      } else setFoundInstall(null)
    }).catch(() => { setFoundInstall(null) })
  }, [activeGame])

  const handleConfirmInstalled = useCallback(() => {
    if (!activeGame || !foundInstall) return
    const { exePath, installKey } = foundInstall
    setLocalGames(prev => {
      const updated = prev.map(g => {
        if (g.id === activeGame.id || g.exePath === activeGame.exePath) {
          return {
            ...g,
            platform: 'pc' as const,
            exePath,
            installDir: activeGame.installDir || g.installDir,
          }
        }
        return g
      })
      setScannedGames(updated)
      return updated
    })
    setFoundInstall(null)
    // Remove from dismissed list since game is now installed
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      const kept = dismissed.filter((k: string) => k !== installKey)
      localStorage.setItem('otix_verify_dismissed', JSON.stringify(kept))
    } catch {}
    if (typeof window !== 'undefined' && (window as any).desktopAPI?.launchGame) {
      console.log('[Play] handleConfirmInstalled launchGame exePath:', exePath)
      ;(window as any).desktopAPI.launchGame({ exePath } as any).catch(console.error)
      toast({
        title: 'Launching Game',
        description: `Running installed executable...`,
        variant: 'success'
      })
    }
  }, [activeGame, foundInstall, toast])

  const handleDismissInstallFound = useCallback(() => {
    if (!foundInstall) return
    const { installKey } = foundInstall
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      if (!dismissed.includes(installKey)) {
        dismissed.push(installKey)
        localStorage.setItem('otix_verify_dismissed', JSON.stringify(dismissed))
      }
    } catch {}
    checkedGameDirs.current.add(installKey)
    setFoundInstall(null)
  }, [foundInstall])

  // Query details for active game from backend
  const { data: activeGameDetail } = useGameDetail(activeGame?.otixMediaId)

  const isSolelyMultiplayer = useMemo(() => {
    if (!activeGameDetail?.gameModes || activeGameDetail.gameModes.length === 0) return false
    const modes = activeGameDetail.gameModes.map(m => m.gameMode.slug)
    const hasSinglePlayer = modes.includes('single-player')
    const hasMultiplayer = modes.some(slug => 
      slug.includes('multiplayer') || 
      slug.includes('co-op') || 
      slug.includes('co-operative') || 
      slug.includes('mmo') || 
      slug.includes('battle-royale')
    )
    return hasMultiplayer && !hasSinglePlayer
  }, [activeGameDetail])

  const { user } = useAuth()
  const [cloudSettings, setCloudSettings] = useState<{
    gameId: string
    autoSync: boolean
    lastSyncAt: string | null
    isPathConfirmed: boolean
    confirmedPath: string | null
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Crowd-sourced save paths queries
  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(activeGame?.otixMediaId)
  const [detectedPath, setDetectedPath] = useState<string | null>(null)
  const [overridePath, setOverridePath] = useState<string | null>(null)
  const [resolvingServerPaths, setResolvingServerPaths] = useState(false)
  const [confirmingPath, setConfirmingPath] = useState(false)
  const autoAssignedGames = useRef(new Set<string>())

  // Auto-detect and auto-assign save folder locations
  useEffect(() => {
    const gameId = activeGame?.id
    if (!gameId || !window.desktopAPI || !cloudSettings) return
    // Per-game guard: auto-assign runs ONCE per game per session, no matter how deps cascade
    if (autoAssignedGames.current.has(gameId)) return
    autoAssignedGames.current.add(gameId)

    const active = true
    setResolvingServerPaths(true)

    ;(async () => {
      try {
        // 1. Get local auto-detected paths
        const discoverRes = await window.desktopAPI.saveDiscoverForGame(gameId, activeGame.title)
        if (!active || activeGame.id !== gameId) return
        const localDetected = discoverRes.detectedPaths[0] || null

        // 2. Get local override path
        const override = await window.desktopAPI.saveGetOverride(gameId)
        if (!active || activeGame.id !== gameId) return
        const overridePathVal = override?.userPath || null
        setOverridePath(overridePathVal)

        // Determine platform key
        const currentPlatform = window.desktopAPI?.platform || 'win32'
        const platformKey = currentPlatform === 'win32' ? 'windows' : currentPlatform === 'darwin' ? 'mac' : 'linux'

        // 3. Resolve server verified paths
        let verifiedPathVal: string | null = null
        if (serverLocations?.verified) {
          const verifiedPatterns = serverLocations.verified
            .filter(loc => loc.platform === platformKey)
            .map(loc => loc.pathPattern)
          if (verifiedPatterns.length > 0) {
            const resolved = await window.desktopAPI.saveResolvePathPatterns(verifiedPatterns)
            if (!active || activeGame.id !== gameId) return
            if (resolved && resolved.length > 0) {
              verifiedPathVal = resolved[0]
            }
          }
        }

        // 4. Resolve server suggested paths
        let suggestedPathVal: string | null = null
        if (serverLocations?.suggested) {
          const suggestedPatterns = serverLocations.suggested
            .filter(loc => loc.platform === platformKey)
            .map(loc => loc.pathPattern)
          if (suggestedPatterns.length > 0) {
            const resolved = await window.desktopAPI.saveResolvePathPatterns(suggestedPatterns)
            if (!active || activeGame.id !== gameId) return
            if (resolved && resolved.length > 0) {
              suggestedPathVal = resolved[0]
            }
          }
        }

        // Determine best candidate
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

        // Auto-assign if not already confirmed
        if (candidate && !cloudSettings.isPathConfirmed && !confirmingPath) {
          console.log(`[AutoAssign] Automatically confirming detected path: ${candidate}`)
          setConfirmingPath(true)
          const token = localStorage.getItem('otix-access-token') || ''
          await window.desktopAPI.saveConfirmPath(
            gameId,
            candidate,
            API_BASE_URL,
            token ? `Bearer ${token}` : ''
          )
          if (!active || activeGame.id !== gameId) return
          const updated = await window.desktopAPI.saveGetCloudSettings(gameId)
          if (!active || activeGame.id !== gameId) return
          setCloudSettings(updated || null)
          setSuccessMsg("Save path automatically detected and confirmed!")
          refetchServerLocations()
        }
      } catch (err) {
        console.error('Failed in path detection/assignment', err)
      } finally {
        if (active) {
          setResolvingServerPaths(false)
          setConfirmingPath(false)
        }
      }
    })()
  }, [activeGame?.id, serverLocations, cloudSettings, confirmingPath, refetchServerLocations])

  useEffect(() => {
    if (!activeGame?.id || !window.desktopAPI) return

    setCloudSettings(null)
    setSyncError(null)
    setSuccessMsg(null)

    window.desktopAPI.saveGetCloudSettings(activeGame.id)
      .then((settings) => {
        setCloudSettings(settings)
      })
      .catch((err) => {
        console.error('Failed to get cloud settings', err)
      })
  }, [activeGame?.id])

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!activeGame?.id || !window.desktopAPI) return
    try {
      await window.desktopAPI.saveSetCloudSettings(activeGame.id, checked)
      setCloudSettings((prev) => prev ? { ...prev, autoSync: checked } : null)
    } catch (err: any) {
      console.error('Failed to set cloud settings', err)
    }
  }

  const handleConfirmPath = async (pathUrl: string) => {
    if (!activeGame?.id || !window.desktopAPI) return
    setConfirmingPath(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      await window.desktopAPI.saveConfirmPath(
        activeGame.id,
        pathUrl,
        API_BASE_URL,
        token ? `Bearer ${token}` : ''
      )
      setSuccessMsg("Save location confirmed successfully!")
      const updated = await window.desktopAPI.saveGetCloudSettings(activeGame.id)
      setCloudSettings(updated)
      refetchServerLocations()
    } catch (err: any) {
      console.error('Failed to confirm path', err)
      setSyncError(err.message || 'Failed to confirm save path.')
    } finally {
      setConfirmingPath(false)
    }
  }

  const handleSelectFolder = async () => {
    if (!activeGame?.id || !window.desktopAPI) return
    try {
      const selected = await window.desktopAPI.saveSelectOverridePath()
      if (selected) {
        await window.desktopAPI.saveSetOverride(activeGame.id, selected)
        setOverridePath(selected)
        setDetectedPath(selected)
        // Automatically confirm manual folder selection
        const token = localStorage.getItem('otix-access-token') || ''
        await window.desktopAPI.saveConfirmPath(
          activeGame.id,
          selected,
          API_BASE_URL,
          token ? `Bearer ${token}` : ''
        )
        const updated = await window.desktopAPI.saveGetCloudSettings(activeGame.id)
        setCloudSettings(updated)
        setSuccessMsg("Save folder selected and confirmed successfully!")
        refetchServerLocations()
      }
    } catch (err: any) {
      console.error('Failed to select override path', err)
      setSyncError(err.message || 'Failed to confirm selected folder.')
    }
  }

  const handleClearOverride = async () => {
    if (!activeGame?.id || !window.desktopAPI) return
    try {
      await window.desktopAPI.saveClearOverride(activeGame.id)
      setOverridePath(null)
      setSuccessMsg("Custom path override cleared.")
      const updated = await window.desktopAPI.saveGetCloudSettings(activeGame.id)
      setCloudSettings(updated)
    } catch (err) {
      console.error('Failed to clear override', err)
    }
  }

  const handleSyncNow = async () => {
    if (!activeGame?.id || !window.desktopAPI) return
    if (!cloudSettings?.isPathConfirmed) {
      setSyncError("Please confirm your save folder location first before syncing.")
      return
    }
    setSyncing(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      const res = await window.desktopAPI.saveSyncCloud(
        activeGame.id,
        activeGame.title,
        'default',
        API_BASE_URL,
        token ? `Bearer ${token}` : ''
      )
      if (res.success) {
        setSuccessMsg(res.message || 'Sync successful!')
        const updated = await window.desktopAPI.saveGetCloudSettings(activeGame.id)
        setCloudSettings(updated)
      } else {
        setSyncError(res.message || 'Sync failed.')
      }
    } catch (err: any) {
      console.error('Sync failed', err)
      setSyncError(err.message || 'An error occurred during synchronization.')
    } finally {
      setSyncing(false)
    }
  }

  // Listen for game ended to trigger auto-sync
  useEffect(() => {
    const api = window.desktopAPI
    if (!api) return

    const unsubscribe = api.onGameEnded(async (data: any) => {
      const gameId = data?.gameId
      const gameTitle = data?.gameTitle || 'Game'
      if (!gameId) return

      try {
        const settings = await api.saveGetCloudSettings(gameId)
        if (settings && settings.autoSync) {
          console.log(`[AutoSync] Triggering auto-sync for game: ${gameId}`)
          const token = localStorage.getItem('otix-access-token') || ''
          await api.saveSyncCloud(
            gameId,
            gameTitle,
            'default',
            API_BASE_URL,
            token ? `Bearer ${token}` : ''
          )
          console.log(`[AutoSync] Auto-sync finished for game: ${gameId}`)
          if (activeGameId === gameId) {
            const updated = await api.saveGetCloudSettings(gameId)
            setCloudSettings(updated)
          }
        }
      } catch (err) {
        console.error(`[AutoSync] Auto-sync failed for game: ${gameId}`, err)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [activeGameId])

  // Sort shelf catalog games based on the selected tab
  const shelfGames = useMemo<DisplayGame[]>(() => {
    // Shelves always show catalog games so users can discover new titles
    const baseList: DisplayGame[] = popularGames.map((p) => ({
      id: p.id,
      title: p.title,
      posterUrl: p.posterUrl || null,
      backdropUrl: p.backdropUrl || undefined,
      logoUrl: p.logoUrl || undefined,
      iconUrl: p.iconUrl || undefined,
      badge: p.avgRating
        ? `★ ${p.avgRating.toFixed(1)} · ${p.ratingCount.toLocaleString()} ratings`
        : p.popularity > 200 ? 'Popular' : 'Featured',
      playtime: '—',
      achievements: p.avgRating ? `${Math.round(p.avgRating * 10)}%` : '—',
      isDefault: true,
      platform: 'pc',
      otixMediaId: p.id
    }))

    if (shelfTab === 'downloaded') {
      // Sort by rating count (best proxy for download popularity)
      return [...baseList].sort((a, b) => {
        const aCount = popularGames.find((p) => p.id === a.id)?.ratingCount ?? 0
        const bCount = popularGames.find((p) => p.id === b.id)?.ratingCount ?? 0
        return bCount - aCount
      })
    }
    if (shelfTab === 'rated') {
      // Sort by rating — catalog games have avgRating
      return [...baseList].sort((a, b) => {
        const aRating = popularGames.find((p) => p.id === a.id)?.avgRating ?? 0
        const bRating = popularGames.find((p) => p.id === b.id)?.avgRating ?? 0
        return bRating - aRating
      })
    }
    // Popular: default order from API
    return baseList
  }, [popularGames, shelfTab])

  // ── Handlers ──

  const handleScan = useCallback(async () => {
    if (!hasDesktopAPI()) {
      toast({
        title: 'Scanner Simulated',
        description: 'Web preview mode: Scanned 0 local game directories.',
        variant: 'info'
      })
      return
    }
    setScanning(true)
    try {
      const api = (window as any).desktopAPI
      const scanned = await api.scanPaths(getScanPaths(), getIsoPaths())
      if (scanned?.length) {
        const matched = await matchMutation.mutateAsync(scanned)
        if (matched?.length) {
          const filtered = filterRejectedSuggestions(matched)
          setLocalGames(filtered)
          setScannedGames(filtered)
          toast({
            title: 'Scan Complete',
            description: `Successfully scanned and loaded ${filtered.length} local games.`,
            variant: 'success'
          })
          if (filtered.length > 0) {
            setActiveGameId(filtered[0].id)
          }
        }
      } else {
        toast({
          title: 'Scan Complete',
          description: 'No local games were detected.',
          variant: 'default'
        })
      }
    } catch (err) {
      console.error('Scan failed:', err)
      toast({
        title: 'Scan Failed',
        description: 'An error occurred while scanning folders.',
        variant: 'error'
      })
    } finally {
      setScanning(false)
    }
  }, [matchMutation, toast])

  const handleSelectGame = useCallback((id: string) => {
    setActiveGameId(id)
    // Scroll hero fold back into view on selection
    const mainEl = document.getElementById('launcher-main-panel')
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleOpenFolder = useCallback(() => {
    if (!activeGame?.rawGame?.exePath) return
    const api = (window as any).desktopAPI
    if (api?.showItemInFolder) {
      api.showItemInFolder(activeGame.rawGame.exePath).catch(console.error)
    } else {
      toast({ title: 'Folder', description: `Located at ${activeGame.rawGame.exePath}`, variant: 'info' })
    }
  }, [activeGame, toast])

  const handleAddLibrary = useCallback(() => {
    if (!activeGame) return
    const mediaId = activeGame.otixMediaId
    if (!mediaId) {
      toast({
        title: 'Cannot Add',
        description: 'This game is not yet matched to the catalog. Run a scan to match it.',
        variant: 'default'
      })
      return
    }
    claimMutation.mutate(mediaId, {
      onSuccess: () => {
        toast({
          title: 'Added to Library',
          description: `"${activeGame.title}" has been added to your collection.`,
          variant: 'success',
          duration: 3000
        })
      },
      onError: () => {
        toast({
          title: 'Failed',
          description: 'Could not add this game to your library.',
          variant: 'error'
        })
      }
    })
  }, [activeGame, claimMutation, toast])

  const handleDenySuggestion = useCallback(() => {
    if (!activeGame?.rawGame?.otixMatchSuggestion) return
    rejectSuggestion(activeGame.rawGame, activeGame.rawGame.otixMatchSuggestion.mediaId)
    // Refresh local state to hide the suggestion
    setLocalGames(getScannedGames())
    toast({
      title: 'Suggestion Dismissed',
      description: `Match suggestion hidden. It won't reappear on future scans.`,
      variant: 'default'
    })
  }, [activeGame, toast])

  const handleActionClick = useCallback(() => {
    if (!activeGame) return

    if (activeGame.isDefault) {
      // Catalog game: Navigate to detail page
      if (activeGame.otixMediaId) {
        navigate({
          to: '/media/$mediaType/$mediaId',
          params: { mediaType: 'game', mediaId: activeGame.otixMediaId }
        } as any)
      }
    } else {
      // Local game: Launch executable
      if (activeGame.rawGame) {
        if (typeof window !== 'undefined' && (window as any).desktopAPI?.launchGame) {
          console.log('[Play] launchGame rawGame:', activeGame.rawGame)
          ;(window as any).desktopAPI.launchGame(activeGame.rawGame).catch(console.error)
          toast({
            title: 'Launching Game',
            description: `Running executable for ${activeGame.title}...`,
            variant: 'success'
          })
        } else {
          toast({
            title: 'Launch Simulated',
            description: `Web preview: Play action executed for ${activeGame.title}.`,
            variant: 'info'
          })
        }
      }
    }
  }, [activeGame, navigate, toast])

  const goToLibrary = useCallback(() => {
    navigate({ to: '/games/library' as any })
  }, [navigate])

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  }

  // Upscale images for hero-sized rendering
  function heroImage(url: string): string {
    return url
      .replace(/\/w185\//, '/w1280/')
      .replace(/\/w342\//, '/w1280/')
      .replace(/\/w500\//, '/w1280/')
      .replace(/\/w780\//, '/w1280/')
      .replace(/t_cover_big/, 't_1080p')
      .replace(/t_screenshot_big/, 't_1080p')
  }

  // Fallback backdrop if none from query or scanned model
  const backdropUrl = useMemo(() => {
    if (!activeGame) return ''
    const raw = (
      activeGameDetail?.backdropUrl ||
      activeGameDetail?.posterUrl ||
      activeGameDetail?.textlessPosterUrl ||
      activeGame.backdropUrl ||
      activeGame.posterUrl ||
      ''
    )
    return raw ? heroImage(raw) : ''
  }, [activeGame, activeGameDetail])

  // Dynamic genres / badge — use catalog detail name, fall back to display badge
  const dynamicBadge = useMemo(() => {
    if (!activeGame) return ''
    if (!activeGame.isDefault) return activeGame.badge || 'Installed Local'
    return activeGameDetail?.genres?.[0]?.name
      ? `${activeGameDetail.genres[0].name} Choice`
      : activeGame.badge || 'Featured'
  }, [activeGame, activeGameDetail])

  if (!activeGame) {
    return (
      <div className="flex items-center justify-center w-full bg-[#0a0a0d] text-white" style={{ height: 'calc(100vh - 5rem)' }}>
        <div className="text-center space-y-4">
          <Gamepad2 size={48} className="mx-auto opacity-30 animate-bounce" />
          <p className="text-sm text-white/40">Loading Game Launcher...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen bg-[#0a0a0d] text-white relative shadow-[0_24px_50px_rgba(0,0,0,0.85)] font-sans select-none">
      <Helmet><title>Games · Otix</title></Helmet>

      {/* Web Preview Banner overlay */}
      <WebPreviewBanner />

      {/* ── FLOATING GAME SELECTOR (fixed, attached below left nav pill) ── */}
      <aside
        className={cn(
          'fixed z-30',
          'w-[4rem]',
          'flex flex-col items-center',
          'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
          'backdrop-blur-lg',
          'shadow-[var(--dk-shadow-glass)]',
          'rounded-[2rem]',
          'overflow-hidden',
        )}
        style={{
          left: '1rem',
          top: '50%',
          transform: 'translateY(-50%)',
          maxHeight: 'calc(100vh - 6rem)',
        }}
      >
        {/* Menu button — access main nav from game launcher */}
        <button
          onClick={toggleNav}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)] shrink-0 mt-2"
          title="Main Menu"
        >
          <Menu size={16} />
        </button>

        {/* Game Cover Thumbnails Stack */}
        <div className="flex-1 min-h-0 flex flex-col items-center gap-3 overflow-y-scroll overflow-x-hidden scrollbar-none w-full px-1.5 pt-3 pb-3">
          {pickerGames.map((game) => {
            const isActive = game.id === activeGame.id
            return (
              <button
                key={game.id}
                onClick={() => handleSelectGame(game.id)}
                className={cn(
                  "w-[46px] h-[46px] rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-300 relative shrink-0",
                  isActive
                    ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.25)] scale-105"
                    : "border-transparent opacity-50 hover:opacity-100 hover:border-white/20"
                )}
                title={`${game.title}${game.isInstalled ? ' ● Installed' : ''}`}
              >
                {(() => {
                  if (game.posterUrl || game.iconUrl) {
                    return <GamePickerThumb icon={game.iconUrl} poster={game.posterUrl} alt={game.title} />
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                      <Gamepad2 size={14} className="opacity-30" />
                    </div>
                  )
                })()}
                {/* Installed indicator */}
                {game.isInstalled && (
                  <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black/30 shadow-sm" />
                )}
                {!game.isInstalled && game.platform === 'iso' && (
                  osName !== 'Windows' ? (
                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500/50 border border-black/30 shadow-sm" title="Can't install this on macOS" />
                  ) : (
                    <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border border-black/30 shadow-sm" title="Ready to Install" />
                  )
                )}
              </button>
            )
          })}
        </div>

        {/* Bottom Library button */}
        <button
          onClick={goToLibrary}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)] shrink-0 mb-2"
          title="Browse All Games"
        >
          <Gamepad2 size={16} />
        </button>
      </aside>

      {/* ── MAIN SCROLLABLE PANEL (HERO + SHELVES) ── */}
      <main
        id="launcher-main-panel"
        className="max-w-[100vw] h-full overflow-y-auto relative flex flex-col scrollbar-none scroll-smooth bg-[#0a0a0d]"
      >

        {/* SECTION 1: HERO VIEWPORT FOLD (100% of container height) */}
        <section className="w-full h-full relative shrink-0">

          {/* Animated Background Art — cinematic fit with overflow fallback */}
          <AnimatePresence mode="wait">
            {backdropUrl ? (
              <motion.div
                key={activeGame.id}
                initial={{ opacity: 0, scale: 1.01 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0 z-0 overflow-hidden"
              >
                {/* Primary backdrop — covers the area */}
                <div
                  className="absolute inset-0 bg-cover bg-[55%_center] bg-no-repeat"
                  style={{ backgroundImage: `url(${backdropUrl})` }}
                />
                {/* Overflow blur layer — fills gaps when image aspect doesn't match */}
                <div
                  className="absolute -inset-[20%] bg-cover bg-[55%_center] bg-no-repeat"
                  style={{
                    backgroundImage: `url(${backdropUrl})`,
                    filter: 'blur(60px)',
                    opacity: 0.35,
                    transform: 'scale(1.1)',
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Gradients overlay for legibility — lighter sides, stronger bottom */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/10 z-1 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent z-1 pointer-events-none" />

          {/* Glassy Sparkles/Trend Badge overlay */}
          {dynamicBadge && (
            <div className="absolute top-8 right-8 bg-white/[0.07] border border-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-wide text-white/90 z-10 flex items-center gap-1.5 shadow-lg uppercase">
              <Sparkles size={11} className="text-yellow-400" />
              {dynamicBadge}
            </div>
          )}

          {/* Bottom elements of the Hero screen */}
          <div className="absolute inset-0 z-10 pointer-events-none">

            {/* Stats (Bottom Left) — playtime + installed status */}
            <div className="absolute bottom-8 flex gap-3 pointer-events-auto" style={{ left: 'calc(76px + 1.5rem)' }}>
              <div className="bg-white/[0.04] border border-white/[0.06] backdrop-blur-2xl rounded-3xl px-6 py-4 min-w-[160px] shadow-2xl hover:bg-white/[0.07] hover:border-white/[0.10] transition-all flex flex-col justify-between">
                <p className="text-2xl font-black text-white tracking-tight leading-none mb-2 flex items-center gap-2">
                  {(() => {
                    // Prefer Steam playtime, fall back to local Electron playtime
                    if (activeGameDetail?.steamPlaytimeForever != null) {
                      const hours = Math.round(activeGameDetail.steamPlaytimeForever! / 60)
                      const mins = activeGameDetail.steamPlaytimeForever! % 60
                      return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
                    }
                    if (localPlaytime && localPlaytime.totalMinutes > 0) {
                      const hours = Math.floor(localPlaytime.totalMinutes / 60)
                      const mins = localPlaytime.totalMinutes % 60
                      return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
                    }
                    return '—'
                  })()}
                  <Play size={14} className="text-emerald-400/80" fill="currentColor" />
                </p>
                <p className="text-[9px] font-black text-white/30 tracking-widest uppercase">
                  Time Played
                </p>
              </div>
              {activeGame && (
                <div className="flex items-center">
                  <div className={cn(
                    "bg-white/[0.04] border border-white/[0.06] backdrop-blur-2xl rounded-3xl px-5 py-4 shadow-2xl transition-all flex flex-col justify-between",
                    activeGame.isInstalled ? "hover:bg-emerald-500/10 hover:border-emerald-500/20" : "hover:bg-white/[0.07] hover:border-white/[0.10]"
                  )}>
                    <p className="text-lg font-black text-white tracking-tight leading-none mb-2 flex items-center gap-2">
                      {activeGame.isInstalled ? (
                        <><span className="text-emerald-400">●</span> Installed</>
                      ) : activeGame.platform === 'iso' && osName !== 'Windows' ? (
                        <><span className="text-red-400/70">⚠</span> Incompatible</>
                      ) : (
                        <><span className="text-white/30">○</span> Not Installed</>
                      )}
                    </p>
                    <p className="text-[9px] font-black text-white/30 tracking-widest uppercase">
                      {activeGame.isInstalled
                        ? 'Ready to play'
                        : activeGame.platform === 'iso'
                          ? osName !== 'Windows'
                            ? "Can't install on macOS"
                            : "Ready to Install"
                          : activeGame.installDir
                            ? `At ${activeGame.installDir}`
                            : 'Local game'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Developer / Publisher (Bottom Right) */}
            {activeGameDetail?.involvedCompanies && activeGameDetail.involvedCompanies.length > 0 && (() => {
              const companies = activeGameDetail.involvedCompanies;
              return (
                <div className="absolute bottom-8 right-8 pointer-events-auto">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-end max-w-xs">
                    {["developer", "publisher"].filter(r => companies.some(c => (c as any)[r])).map((role) => (
                      <span key={role} className="text-[10px] text-white/35">
                        <span className="uppercase tracking-wider">{role}</span>{' '}
                        <span className="text-white/60">
                          {companies.filter(c => (c as any)[role]).map(c => c.company.name).join(", ")}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Game Info & Action Buttons (Center Right) */}
            <div className="absolute right-8 top-1/2 -translate-y-[35%] flex flex-col items-end text-right max-w-sm pointer-events-auto">
              {(activeGameDetail?.logoUrl || activeGame.logoUrl) ? (
                <img
                  src={activeGameDetail?.logoUrl || activeGame.logoUrl}
                  alt={activeGame.title}
                  className="h-52 object-contain mb-6 drop-shadow-[0_8px_40px_rgba(0,0,0,0.8)] max-w-[600px]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const sib = (e.target as HTMLImageElement).nextSibling as HTMLElement;
                    if (sib) sib.style.display = 'block';
                  }}
                />
              ) : null}

              <h2
                className="text-4xl font-black tracking-tight text-white mb-3 uppercase drop-shadow-md"
                style={{ display: (activeGame.logoUrl || activeGameDetail?.logoUrl) ? 'none' : 'block' }}
              >
                {activeGame.title}
              </h2>

              <p className="text-[11px] text-white/60 leading-relaxed font-normal max-w-xs mb-3 line-clamp-3">
                {activeGameDetail?.overview || activeGame.description || "No description overview available for this title in the catalog."}
              </p>

              {/* Detail metadata row */}
              <div className="flex flex-wrap gap-1.5 justify-end max-w-xs mb-4">
                {activeGameDetail?.releaseDate && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">
                    {activeGameDetail.releaseDate.slice(0, 4)}
                    {activeGameDetail.releaseStatus && activeGameDetail.releaseStatus !== "released" && (
                      <> · <span className="text-blue-400">{activeGameDetail.releaseStatus}</span></>
                    )}
                  </span>
                )}
                {activeGameDetail?.isFree && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/12 text-green-400 border border-green-500/20">
                    Free
                  </span>
                )}
                {activeGameDetail?.hasMultiplayer && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">
                    Multiplayer
                  </span>
                )}
                {activeGameDetail?.genres?.slice(0, 3).map((g) => (
                  <span key={g.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">
                    {g.name}
                  </span>
                ))}
              </div>

              {/* Action Buttons — context aware */}
              <div className="flex gap-2.5 items-center justify-end">
                {(() => {
                  const isIncompatible = activeGame.platform === 'iso' && osName !== 'Windows'
                  // Installed: Play + Open Folder + Choose Exe
                  if (activeGame.isInstalled) {
                    return (
                      <>
                        <button
                          onClick={handleOpenFolder}
                          className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70"
                        >
                          <HardDrive size={13} />
                          Open Folder
                        </button>
                        <button
                          onClick={async () => {
                            const api = (window as any).desktopAPI
                            if (!api?.pickExecutable) return
                            const newExe = await api.pickExecutable(activeGame.installDir)
                            if (!newExe) return
                            console.log('[ChooseExe] picked:', newExe)
                            // Update game in local state and persist
                            const updated = getScannedGames().map((g: any) =>
                              g.id === activeGame.id ? { ...g, exePath: newExe } : g
                            )
                            setLocalGames(updated)
                            setScannedGames(updated)
                            toast({
                              title: 'Executable Updated',
                              description: `Game exe changed to: ${newExe}`,
                              variant: 'success'
                            })
                          }}
                          className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/50"
                          title="Choose a different executable"
                        >
                          <Search size={13} />
                          Choose Exe
                        </button>
                        <button
                          onClick={handleActionClick}
                          className="px-5.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                        >
                          <Play size={14} fill="currentColor" />
                          Play
                        </button>
                        {activeGame.otixMediaId && (
                          <button
                            onClick={() => navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'game', mediaId: activeGame.otixMediaId! } } as any)}
                            className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70"
                          >
                            <Search size={13} />
                            Details
                          </button>
                        )}
                      </>
                    )
                  }
                  // Catalog game: View Details + Add to Library
                  if (activeGame.isDefault) {
                    return (
                      <>
                        <button
                          onClick={handleAddLibrary}
                          className="px-4.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/95"
                        >
                          <Plus size={14} />
                          Add to Library
                        </button>
                        <button
                          onClick={handleActionClick}
                          className="px-5.5 py-2.5 bg-white hover:bg-white/90 text-black rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                        >
                          <Search size={14} />
                          View Details
                        </button>
                      </>
                    )
                  }
                  // Incompatible: View Details only
                  if (isIncompatible) {
                    return (
                      <button
                        onClick={handleActionClick}
                        className="px-5.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70"
                        disabled
                      >
                        <span className="text-red-400/70">⚠</span>
                        Can't install on macOS
                      </button>
                    )
                  }
                  // ISO available (and not installed): Install + Match (if unmatched)
                  if (activeGame.platform === 'iso') {
                    if (activeInstall) {
                      const message = activeInstall.progress?.message ?? 'Installing...'
                      return (
                        <div className="flex gap-2 items-stretch h-[38px]">
                          <button
                            onClick={() => setIsInstallerOpen(true)}
                            className="relative overflow-hidden px-4 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] text-white w-48 justify-start"
                          >
                            {/* Visual Progress Bar Overlay */}
                            <div 
                              className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-600/30 animate-pulse pointer-events-none"
                            />
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0 relative z-10" />
                            <div className="flex flex-col items-start relative z-10 text-left min-w-0 leading-tight">
                              <span className="font-bold text-white truncate w-full text-[10px]">Installing...</span>
                              <span className="text-[9px] text-white/50 truncate w-full">{message}</span>
                            </div>
                          </button>
                          <button
                            onClick={() => cancelInstall(activeInstall.isoPath)}
                            className="px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center justify-center"
                            title="Cancel Installation"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )
                    }
                    return (
                      <>
                        {!activeGame.otixMediaId && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                if (activeGame.rawGame) {
                                  matchMutation.mutateAsync([activeGame.rawGame]).then((matched) => {
                                    if (matched?.length) {
                                      const filtered = filterRejectedSuggestions(matched)
                                      setLocalGames(filtered)
                                      setScannedGames(filtered)
                                      syncMutation.mutate(filtered)
                                      toast({ title: 'Game Matched', description: `"${matched[0]?.otixMediaTitle || matched[0]?.title}" found in catalog.`, variant: 'success' })
                                    }
                                  }).catch(() => {})
                                }
                              }}
                              className="px-4.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                            >
                              <Search size={14} />
                              Match Game
                            </button>
                            {activeGame.rawGame?.otixMatchSuggestion && (
                              <button
                                onClick={handleDenySuggestion}
                                className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95"
                                title="Deny this match suggestion — it won't reappear"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => setIsInstallerOpen(true)}
                          className="px-5.5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                        >
                          <Disc size={14} />
                          Install
                        </button>
                      </>
                    )
                  }
                  // Unmatched local game: Match
                  return (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          if (activeGame.rawGame) {
                            matchMutation.mutateAsync([activeGame.rawGame]).then((matched) => {
                              if (matched?.length) {
                                const filtered = filterRejectedSuggestions(matched)
                                setLocalGames(filtered)
                                setScannedGames(filtered)
                                syncMutation.mutate(filtered)
                                toast({ title: 'Game Matched', description: `"${matched[0]?.otixMediaTitle || matched[0]?.title}" found in catalog.`, variant: 'success' })
                              }
                            }).catch(() => {})
                          }
                        }}
                        className="px-5.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                      >
                        <Search size={14} />
                        Match Game
                      </button>
                      {activeGame.rawGame?.otixMatchSuggestion && (
                        <button
                          onClick={handleDenySuggestion}
                          className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95"
                          title="Deny this match suggestion — it won't reappear"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Install verification prompt — game files detected but not marked installed */}
              {foundInstall?.exePath && !activeGame.isInstalled && (
                <div className="mt-4 p-3.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 backdrop-blur-md space-y-2.5 w-[280px] text-left">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-[11px] font-black tracking-wider uppercase text-white/90">Game Detected</span>
                  </div>
                  <p className="text-[10px] text-white/60 leading-normal">
                    Files found in install folder. Is this game fully installed?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmInstalled}
                      className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-bold text-[9px] rounded-lg px-2.5 py-1.5 cursor-pointer"
                    >
                      <Play size={11} fill="currentColor" />
                      Yes, Launch
                    </button>
                    <button
                      onClick={handleDismissInstallFound}
                      className="flex-1 inline-flex items-center justify-center gap-1 bg-white/8 hover:bg-white/12 active:scale-95 transition-all text-white/70 font-bold text-[9px] rounded-lg px-2.5 py-1.5 cursor-pointer"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              )}

              {/* Google Drive Save Sync Card / Online Multiplayer Notice */}
              {activeGame.isInstalled && (
                isSolelyMultiplayer ? (
                  <div className="mt-4 p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/15 backdrop-blur-md space-y-1.5 w-[280px] text-left">
                    <div className="flex items-center gap-2">
                      <Cloud size={14} className="text-blue-400" />
                      <span className="text-[11px] font-black tracking-wider uppercase text-white/90">Save Sync Not Required</span>
                    </div>
                    <p className="text-[10px] text-white/50 leading-normal">
                      This is an online-only multiplayer service game. Progress and saves are managed directly by the server.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md space-y-3 w-[280px] text-left">
                    <div className="flex items-center gap-2">
                      <Cloud size={14} className="text-[#4285F4]" />
                      <span className="text-[11px] font-black tracking-wider uppercase text-white/90">Google Drive Sync</span>
                      {user?.googleId && (
                        <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-md px-1.5 py-0.5">
                          Connected
                        </span>
                      )}
                    </div>

                    {!user?.googleId ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-white/50 leading-normal">
                          Link your Google account in Settings to enable Cloud Save backups for your games.
                        </p>
                        <Link
                          to="/settings"
                          search={{ section: "integrations" }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4285F4] hover:bg-[#4285F4]/90 active:scale-95 transition-all px-3 py-1.5 text-[10px] font-bold text-white cursor-pointer"
                        >
                          <Link2 size={12} /> Link Google Account
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-[10px] border-b border-white/5 pb-1.5">
                          <span className="text-white/40">Account</span>
                          <span className="text-white/70 font-semibold truncate max-w-[140px]" title={user.googleEmail || user.googleName || ""}>
                            {user.googleName || user.googleEmail}
                          </span>
                        </div>

                        {/* Save Location Confirmation Section */}
                        <div className="space-y-1.5 border-b border-white/5 pb-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white/80 flex items-center gap-1">
                              <Folder size={11} className="text-white/40" /> Save Folder
                            </span>
                            {cloudSettings?.isPathConfirmed ? (
                              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check size={10} /> Confirmed
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
                                <AlertCircle size={10} /> Unconfirmed
                              </span>
                            )}
                          </div>

                          {cloudSettings?.isPathConfirmed ? (
                            <div className="space-y-1">
                              <p className="text-[9px] text-white/60 bg-white/5 border border-white/10 rounded px-1.5 py-1 font-mono break-all leading-tight">
                                {cloudSettings.confirmedPath}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleSelectFolder}
                                  className="text-[9px] text-white/50 hover:text-white/80 transition-all font-semibold underline cursor-pointer"
                                >
                                  Change folder
                                </button>
                                {overridePath && (
                                  <button
                                    type="button"
                                    onClick={handleClearOverride}
                                    className="text-[9px] text-rose-400/70 hover:text-rose-400 transition-all font-semibold underline cursor-pointer"
                                  >
                                    Clear override
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : detectedPath ? (
                            <div className="space-y-1.5">
                              <p className="text-[9px] text-white/60 bg-white/5 border border-white/10 rounded px-1.5 py-1 font-mono break-all leading-tight">
                                {detectedPath}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={confirmingPath || resolvingServerPaths}
                                  onClick={() => handleConfirmPath(detectedPath)}
                                  className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer disabled:opacity-40"
                                >
                                  {confirmingPath ? "Confirming..." : "Confirm Folder"}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSelectFolder}
                                  className="inline-flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer"
                                >
                                  Select Manually
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[9px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-1 leading-normal flex items-start gap-1">
                                <AlertCircle size={10} className="flex-shrink-0 mt-0.5" />
                                <span>Save folder not detected automatically.</span>
                              </p>
                              <button
                                type="button"
                                onClick={handleSelectFolder}
                                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer"
                              >
                                Select Folder Manually
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold text-white/80">Auto Sync</span>
                            <p className="text-[9px] text-white/30 leading-none">Sync saves on game exit</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleAutoSync(!(cloudSettings?.autoSync))}
                            className={cn(
                              "relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer",
                              cloudSettings?.autoSync ? "bg-emerald-500" : "bg-white/10"
                            )}
                          >
                            <span
                              className={cn(
                                "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                                cloudSettings?.autoSync ? "translate-x-3.5" : "translate-x-0.5"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            disabled={syncing}
                            onClick={handleSyncNow}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg text-[10px] font-bold text-white transition-all cursor-pointer disabled:opacity-40 active:scale-95"
                          >
                            <RefreshCw size={11} className={cn("text-white/60", syncing && "animate-spin")} />
                            {syncing ? "Syncing..." : "Sync Now"}
                          </button>
                          <div className="text-right">
                            {cloudSettings?.lastSyncAt ? (
                              <span className="text-[9px] text-white/40 block leading-none">
                                Synced {new Date(cloudSettings.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-[9px] text-white/30 block leading-none">Never synced</span>
                            )}
                          </div>
                        </div>

                        {syncError && (
                          <p className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/15 rounded-lg p-1.5 flex items-start gap-1">
                            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                            <span>{syncError}</span>
                          </p>
                        )}

                        {successMsg && (
                          <p className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-lg p-1.5 flex items-start gap-1">
                            <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5" />
                            <span>{successMsg}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: SHELVES & SYSTEM STATISTICS (Scrollable fold) */}
        <section className="w-full bg-[#08080a] border-t border-white/[0.03] py-8 pr-8 shrink-0 flex flex-col gap-8" style={{ paddingLeft: 'calc(76px + 1.5rem)' }}>

          {/* Game Shelf */}
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-5">
              <h3 className="text-sm font-black text-white/90 uppercase tracking-wider">
                {shelfTab === 'popular' ? 'Popular' : shelfTab === 'downloaded' ? 'Most Downloaded' : 'Top Rated'}
              </h3>

              <div className="flex gap-6 items-center">
                <button
                  onClick={() => setShelfTab('popular')}
                  className={cn(
                    "text-[11px] font-semibold transition-all cursor-pointer pb-0.5",
                    shelfTab === 'popular'
                      ? "text-white border-b border-white"
                      : "text-white/35 hover:text-white/60"
                  )}
                >
                  Popular
                </button>
                <button
                  onClick={() => setShelfTab('downloaded')}
                  className={cn(
                    "text-[11px] font-semibold transition-all cursor-pointer pb-0.5",
                    shelfTab === 'downloaded'
                      ? "text-white border-b border-white"
                      : "text-white/35 hover:text-white/60"
                  )}
                >
                  Most Downloaded
                </button>
                <button
                  onClick={() => setShelfTab('rated')}
                  className={cn(
                    "text-[11px] font-semibold transition-all cursor-pointer pb-0.5",
                    shelfTab === 'rated'
                      ? "text-white border-b border-white"
                      : "text-white/35 hover:text-white/60"
                  )}
                >
                  Top Rated
                </button>
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x">
              {shelfGames.map((game) => (
                <button
                  key={`shelf-${game.id}`}
                  onClick={() => handleSelectGame(game.id)}
                  className={cn(
                    "w-[120px] aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer border shadow-md relative hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 snap-start",
                    game.id === activeGame.id
                      ? "border-white shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                      : "border-white/5 hover:border-white/20"
                  )}
                  title={game.title}
                >
                  {game.posterUrl ? (
                    <img
                      src={game.posterUrl}
                      alt={game.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                      <Gamepad2 size={18} className="opacity-30" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Storage & Scanner Status Footer */}
          <div className="flex flex-col md:flex-row justify-between items-stretch gap-6">

            {/* Storage space widget */}
            {diskInfo ? (
              <div className="flex-1 rounded-2xl bg-white/5 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition-colors max-w-sm animate-fade-in">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/15 to-blue-600/5 flex items-center justify-center border border-white/5">
                    <HardDrive size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-white/90">{diskInfo.drive}</span>
                    <span className="text-[10px] text-white/40 ml-2">{formatBytes(diskInfo.free)} free</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                    style={{ width: `${((diskInfo.used / (diskInfo.total || diskInfo.used + diskInfo.free)) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-white/30 font-semibold">
                  <span>{formatBytes(diskInfo.used)} used</span>
                  <span>{formatBytes(diskInfo.free)} free</span>
                </div>
              </div>
            ) : null}

            {/* Quick settings link */}
            <div className="flex-1 rounded-2xl bg-white/3 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold text-white/90 mb-1 flex items-center gap-1.5">
                    <Gamepad2 size={13} className="text-pink-400" />
                    Scan and Manage Local Library
                  </h3>
                  <p className="text-[11px] text-white/40 max-w-md">
                    Add installation folders in Settings and run a scanner to match local executables, track achievements, and launch games natively.
                  </p>
                </div>
                <ChevronRight size={16} className="text-white/30 shrink-0 mt-0.5" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="px-3.5 py-1.5 bg-white hover:bg-white/90 text-black rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Scan size={12} className={cn(scanning && 'animate-spin')} />
                  {scanning ? 'Scanning...' : 'Scan Now'}
                </button>
                <button
                  onClick={() => navigate({ to: '/settings' as any })}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-white/70 transition-colors cursor-pointer"
                >
                  Configure Paths
                </button>
                <button
                  onClick={goToLibrary}
                  className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-xl text-[10px] font-bold text-white transition-colors cursor-pointer"
                >
                  View Full Library
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <IsoInstallerModal
        open={isInstallerOpen}
        onClose={() => setIsInstallerOpen(false)}
        games={localGames}
        initialIsoPath={activeGame?.rawGame?.exePath || undefined}
        onInstallComplete={handleInstallComplete}
      />
    </div>
  )
}
