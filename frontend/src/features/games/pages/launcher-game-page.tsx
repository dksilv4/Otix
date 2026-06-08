/* ── LauncherGamePage — self-contained game detail viewport ── */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import {
    Gamepad2,
    Play,
    Plus,
    Search,
    HardDrive,
    Disc,
    Loader2,
    X,
    Folder,
    Check,
    Cloud,
    Link2,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, osName } from '@/lib/utils'
import { useDesktopPlatform } from '@/lib/desktop-platform'
import { getDesktopAPI } from '@/lib/desktop-api'
import { useAuth } from '@/features/auth/auth-provider'
import { API_BASE_URL } from '@/lib/api-client'
import { useGames, useRejectSuggestion } from '@/features/game-scanner/game-queries'
import { useGameDetail, useSaveLocations } from '@/features/games/games-queries'
import { useClaimGame } from '@/features/library/library-queries'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useInstallProgress } from '@/features/game-scanner/install-store'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/game-scanner/queries'
import { IsoInstallerModal } from '@/features/game-scanner/organisms/iso-installer-modal'
import type { CatalogGameDetail } from '@/features/games/types'
import type { DisplayGame } from '@/features/games/hooks/use-local-games'
import type { LocalGame } from '@/features/games/types'

/* ── Helpers ── */

function heroImage(url: string): string {
  return url
    .replace(/\/w185\//, '/w1280/')
    .replace(/\/w342\//, '/w1280/')
    .replace(/\/w500\//, '/w1280/')
    .replace(/\/w780\//, '/w1280/')
    .replace(/t_cover_big/, 't_1080p')
    .replace(/t_screenshot_big/, 't_1080p')
}

function toDisplayGame(g: LocalGame): DisplayGame {
  const platformLabel = g.platform.toUpperCase()
  const isMatched = !!g.data?.id
  const matchLabel = isMatched ? '✓ Matched' : (g.matchSuggestion ? '⚠ Suggestion' : 'Unmatched')
  return {
    id: g.id,
    title: g.data?.title || g.title,
    posterUrl: g.data?.posterUrl || g.posterUrl || null,
    backdropUrl: undefined,
    iconUrl: g.data?.iconUrl || g.iconUrl || undefined,
    logoUrl: undefined,
    badge: `${platformLabel} · ${matchLabel}`,
    playtime: '—',
    achievements: isMatched ? 'Owned' : '—',
    isDefault: false,
    platform: g.platform,
    exePath: g.exePath,
    installDir: g.installDir,
    isInstalled: !!g.exePath && g.platform !== 'iso',
    otixMediaId: g.data?.id || undefined,
    rawGame: g,
  }
}

/* ── Component ── */

export function LauncherGamePage() {
  const navigate = useNavigate()
  const { isDesktop } = useDesktopPlatform()
  const { toast } = useToast()
  const { user } = useAuth()
  const { data: localGames = [] } = useGames()
  const rejectSuggestionMutation = useRejectSuggestion()
  const claimMutation = useClaimGame()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const { activeInstalls, cancelInstall } = useInstallProgress()

  // ── Local game state ──

  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [foundInstall, _setFoundInstall] = useState<{ exePath: string; installKey: string } | null>(null)
  const [isInstallerOpen, setIsInstallerOpen] = useState(false)

  // Sync activeGameId from FloatingGameSelector selection
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail
      if (typeof id === 'string') setActiveGameId(id)
    }
    window.addEventListener('launcher:select-game', handler)
    return () => window.removeEventListener('launcher:select-game', handler)
  }, [])

  // Auto-select first game if none selected
  useEffect(() => {
    if (!activeGameId && localGames.length > 0) {
      setActiveGameId(localGames[0].id)
    }
  }, [localGames, activeGameId])

  // ── Writable setLocalGames (no-op — data managed by useGames() query) ──

  const setLocalGames: React.Dispatch<React.SetStateAction<LocalGame[]>> = useCallback(() => {}, [])

  // ── Derived ──

  const displayGames = useMemo(() => localGames.map(toDisplayGame), [localGames])

  const activeGame = useMemo<DisplayGame | null>(() => {
    if (!activeGameId) return displayGames[0] || null
    return displayGames.find(g => g.id === activeGameId) || displayGames[0] || null
  }, [displayGames, activeGameId])

  const { data: activeGameDetail } = useGameDetail(activeGame?.otixMediaId)

  // ── Local playtime ──

  const [localPlaytime, setLocalPlaytime] = useState<{ totalMinutes: number; sessionCount: number; lastPlayed: number | null } | null>(null)

  useEffect(() => {
    setLocalPlaytime(null)
    if (!activeGame || !isDesktop) return
    const api = getDesktopAPI()
    if (!api?.getPlaytimeForGame) return
    const gameId = activeGame.rawGame?.id || activeGame.id
    api.getPlaytimeForGame(gameId).then(setLocalPlaytime).catch(() => setLocalPlaytime(null))
  }, [activeGame?.id, isDesktop])

  // ── Active install ──

  const activeInstall = useMemo(() => {
    const activePath = activeGame?.rawGame?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find(i => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, activeGame])

  // ── Multiplayer detection ──

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

  // ── Backdrop URL ──

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

  // ── Dynamic badge ──

  const dynamicBadge = useMemo(() => {
    if (!activeGame) return ''
    if (!activeGame.isDefault) return activeGame.badge || 'Installed Local'
    return activeGameDetail?.genres?.[0]?.name
      ? `${activeGameDetail.genres[0].name} Choice`
      : activeGame.badge || 'Featured'
  }, [activeGame, activeGameDetail])

  // ── Cloud save state ──

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

  // ── Save path state ──

  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(activeGame?.otixMediaId)
  const [detectedPath, setDetectedPath] = useState<string | null>(null)
  const [overridePath, setOverridePath] = useState<string | null>(null)
  const [resolvingServerPaths, setResolvingServerPaths] = useState(false)
  const [confirmingPath, setConfirmingPath] = useState(false)
  const autoAssignedGames = useRef(new Set<string>())

  // ── Auto-detect and auto-assign save folder locations ──

  useEffect(() => {
    const gameId = activeGame?.id
    if (!gameId || !getDesktopAPI() || !cloudSettings) return
    const api = getDesktopAPI()!
    if (autoAssignedGames.current.has(gameId)) return
    autoAssignedGames.current.add(gameId)

    let cancelled = false
    setResolvingServerPaths(true)

    ;(async () => {
      try {
        const discoverRes = await api.saveDiscoverForGame(gameId, activeGame.title)
        if (cancelled || activeGame.id !== gameId) return
        const localDetected = discoverRes.detectedPaths[0] || null

        const override = await api.saveGetOverride(gameId)
        if (cancelled || activeGame.id !== gameId) return
        const overridePathVal = override?.userPath || null
        setOverridePath(overridePathVal)

        const currentPlatform = getDesktopAPI()?.platform || 'win32'
        const platformKey = currentPlatform === 'win32' ? 'windows' : currentPlatform === 'darwin' ? 'mac' : 'linux'

        let verifiedPathVal: string | null = null
        if (serverLocations?.verified) {
          const verifiedPatterns = serverLocations.verified
            .filter(loc => loc.platform === platformKey)
            .map(loc => loc.pathPattern)
          if (verifiedPatterns.length > 0) {
            const resolved = await api.saveResolvePathPatterns(verifiedPatterns)
            if (cancelled || activeGame.id !== gameId) return
            if (resolved && resolved.length > 0) {
              verifiedPathVal = resolved[0]
            }
          }
        }

        let suggestedPathVal: string | null = null
        if (serverLocations?.suggested) {
          const suggestedPatterns = serverLocations.suggested
            .filter(loc => loc.platform === platformKey)
            .map(loc => loc.pathPattern)
          if (suggestedPatterns.length > 0) {
            const resolved = await api.saveResolvePathPatterns(suggestedPatterns)
            if (cancelled || activeGame.id !== gameId) return
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

        if (candidate && !cloudSettings.isPathConfirmed && !confirmingPath) {
          setConfirmingPath(true)
          const token = localStorage.getItem('otix-access-token') || ''
          await api.saveConfirmPath(gameId, candidate, API_BASE_URL, token ? `Bearer ${token}` : '')
          if (cancelled || activeGame.id !== gameId) return
          const updated = await api.saveGetCloudSettings(gameId)
          if (cancelled || activeGame.id !== gameId) return
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
  }, [activeGame?.id, serverLocations, cloudSettings, confirmingPath, refetchServerLocations])

  // ── Fetch cloud settings per game ──

  useEffect(() => {
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    setCloudSettings(null)
    setSyncError(null)
    setSuccessMsg(null)

    api.saveGetCloudSettings(activeGame.id)
      .then((settings) => { setCloudSettings(settings) })
      .catch((err) => { console.error('Failed to get cloud settings', err) })
  }, [activeGame?.id])

  // ── Handlers: cloud sync ──

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    try {
      await api.saveSetCloudSettings(activeGame.id, checked)
      setCloudSettings((prev) => prev ? { ...prev, autoSync: checked } : null)
    } catch (err: any) {
      console.error('Failed to set cloud settings', err)
    }
  }

  const handleConfirmPath = async (pathUrl: string) => {
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    setConfirmingPath(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      await api.saveConfirmPath(activeGame.id, pathUrl, API_BASE_URL, token ? `Bearer ${token}` : '')
      setSuccessMsg("Save location confirmed successfully!")
      const updated = await api.saveGetCloudSettings(activeGame.id)
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
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    try {
      const selected = await api.saveSelectOverridePath()
      if (selected) {
        await api.saveSetOverride(activeGame.id, selected)
        setOverridePath(selected)
        setDetectedPath(selected)
        const token = localStorage.getItem('otix-access-token') || ''
        await api.saveConfirmPath(activeGame.id, selected, API_BASE_URL, token ? `Bearer ${token}` : '')
        const updated = await api.saveGetCloudSettings(activeGame.id)
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
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    try {
      await api.saveClearOverride(activeGame.id)
      setOverridePath(null)
      setSuccessMsg("Custom path override cleared.")
      const updated = await api.saveGetCloudSettings(activeGame.id)
      setCloudSettings(updated)
    } catch (err) {
      console.error('Failed to clear override', err)
    }
  }

  const handleSyncNow = async () => {
    if (!activeGame?.id || !getDesktopAPI()) return
    const api = getDesktopAPI()!
    if (!cloudSettings?.isPathConfirmed) {
      setSyncError("Please confirm your save folder location first before syncing.")
      return
    }
    setSyncing(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      const res = await api.saveSyncCloud(activeGame.id, activeGame.title, 'default', API_BASE_URL, token ? `Bearer ${token}` : '')
      if (res.success) {
        setSuccessMsg(res.message || 'Sync successful!')
        const updated = await api.saveGetCloudSettings(activeGame.id)
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

  // ── Game-ended auto-sync ──

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api) return
    const unsubscribe = api.onGameEnded(async (data: any) => {
      const gameId = data?.gameId
      const gameTitle = data?.gameTitle || 'Game'
      if (!gameId) return
      try {
        const settings = await api.saveGetCloudSettings(gameId)
        if (settings && settings.autoSync) {
          const token = localStorage.getItem('otix-access-token') || ''
          await api.saveSyncCloud(gameId, gameTitle, 'default', API_BASE_URL, token ? `Bearer ${token}` : '')
          if (activeGame?.id === gameId) {
            const updated = await api.saveGetCloudSettings(gameId)
            setCloudSettings(updated)
          }
        }
      } catch (err) {
        console.error(`[AutoSync] Auto-sync failed for game: ${gameId}`, err)
      }
    })
    return () => { unsubscribe() }
  }, [activeGame?.id])

  // ── Handlers: game actions ──

  const handleOpenFolder = useCallback(() => {
    if (!activeGame?.rawGame?.exePath) return
    const api = getDesktopAPI()
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
      toast({ title: 'Cannot Add', description: 'This game is not yet matched to the catalog. Run a scan to match it.', variant: 'default' })
      return
    }
    claimMutation.mutate(mediaId, {
      onSuccess: () => {
        toast({ title: 'Added to Library', description: `"${activeGame.title}" has been added to your collection.`, variant: 'success', duration: 3000 })
      },
      onError: () => {
        toast({ title: 'Failed', description: 'Could not add this game to your library.', variant: 'error' })
      }
    })
  }, [activeGame, claimMutation, toast])

  const handleActionClick = useCallback(() => {
    if (!activeGame) return
    if (activeGame.isDefault) {
      if (activeGame.otixMediaId) {
        navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'game', mediaId: activeGame.otixMediaId } } as any)
      }
    } else {
      if (activeGame.rawGame) {
        const api = getDesktopAPI()
        if (api?.launchGame) {
          api.launchGame(activeGame.rawGame).catch(console.error)
          toast({ title: 'Launching Game', description: `Running executable for ${activeGame.title}...`, variant: 'success' })
        } else {
          toast({ title: 'Launch Simulated', description: `Web preview: Play action executed for ${activeGame.title}.`, variant: 'info' })
        }
      }
    }
  }, [activeGame, navigate, toast])

  // ── Handlers: install verification ──

  const handleConfirmInstalled = useCallback(() => {
    if (!activeGame || !foundInstall) return
    const { exePath, installKey } = foundInstall
    _setFoundInstall(null)
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      const kept = dismissed.filter((k: string) => k !== installKey)
      localStorage.setItem('otix_verify_dismissed', JSON.stringify(kept))
    } catch { /* ignore */ }

    const api = getDesktopAPI()
    if (api?.launchGame) {
      api.launchGame({ exePath } as LocalGame).catch(console.error)
      toast({ title: 'Launching Game', description: 'Running installed executable...', variant: 'success' })
    }
  }, [activeGame, foundInstall, toast, setLocalGames])

  const handleDismissInstallFound = useCallback(() => {
    if (!foundInstall) return
    const { installKey } = foundInstall
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      if (!dismissed.includes(installKey)) {
        dismissed.push(installKey)
        localStorage.setItem('otix_verify_dismissed', JSON.stringify(dismissed))
      }
    } catch { /* ignore */ }
    _setFoundInstall(null)
  }, [foundInstall])

  const handleDenySuggestion = useCallback(() => {
    if (!activeGame?.rawGame?.matchSuggestion) return
    rejectSuggestionMutation.mutate({
      gameId: activeGame.rawGame.id,
      suggestionMediaId: activeGame.rawGame.matchSuggestion.id,
    })
    toast({
      title: 'Suggestion Dismissed',
      description: "Match suggestion hidden. It won't reappear on future scans.",
      variant: 'default',
    })
  }, [activeGame, rejectSuggestionMutation, toast])

  // ── No game loaded ──

  if (!activeGame) {
    return (
      <section className="w-full h-full min-w-[100vw] min-h-[100vh] bg-[#0a0a0d] relative shrink-0 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Gamepad2 size={48} className="mx-auto opacity-30" />
          <p className="text-sm text-white/40">Select a game to view details</p>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full h-full min-w-[100vw] min-h-[100vh] bg-[white] bg-grid-pattern relative shrink-0">
      {/* Animated Background Art */}
      <AnimatePresence mode="wait">
        <motion.div
            key={activeGame.id}
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="absolute inset-0 z-0 overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-cover bg-[55%_center] bg-no-repeat"
              style={{ backgroundImage: `url(${backdropUrl})` }}
            />
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
      </AnimatePresence>

      {/* Gradients overlay */}
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

        {/* Stats (Bottom Left) */}
        <div className="absolute bottom-8 flex gap-3 pointer-events-auto" style={{ left: 'calc(76px + 1.5rem)' }}>
          <div className="bg-white/[0.04] border border-white/[0.06] backdrop-blur-2xl rounded-3xl px-6 py-4 min-w-[160px] shadow-2xl hover:bg-white/[0.07] hover:border-white/[0.10] transition-all flex flex-col justify-between">
            <p className="text-2xl font-black text-white tracking-tight leading-none mb-2 flex items-center gap-2">
              {(() => {
                if (activeGameDetail?.steamPlaytimeForever != null) {
                  const hours = Math.round(activeGameDetail.steamPlaytimeForever / 60)
                  const mins = activeGameDetail.steamPlaytimeForever % 60
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
            <p className="text-[9px] font-black text-white/30 tracking-widest uppercase">Time Played</p>
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
                      ? osName !== 'Windows' ? "Can't install on macOS" : "Ready to Install"
                      : activeGame.installDir ? `At ${activeGame.installDir}` : 'Local game'}
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
                {["developer", "publisher"].filter(r => companies.some((c: any) => (c as any)[r])).map((role) => (
                  <span key={role} className="text-[10px] text-white/35">
                    <span className="uppercase tracking-wider">{role}</span>{' '}
                    <span className="text-white/60">
                      {companies.filter((c: any) => (c as any)[role]).map((c: any) => c.company.name).join(", ")}
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
                (e.target as HTMLImageElement).style.display = 'none'
                const sib = (e.target as HTMLImageElement).nextSibling as HTMLElement
                if (sib) sib.style.display = 'block'
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
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/12 text-green-400 border border-green-500/20">Free</span>
            )}
            {activeGameDetail?.hasMultiplayer && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">Multiplayer</span>
            )}
            {activeGameDetail?.genres?.slice(0, 3).map((g) => (
              <span key={g.id} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/5">{g.name}</span>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 items-center justify-end">
            {(() => {
              const isIncompatible = activeGame.platform === 'iso' && osName !== 'Windows'
              if (activeGame.isInstalled) {
                return (
                  <>
                    <button onClick={handleOpenFolder} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70">
                      <HardDrive size={13} /> Open Folder
                    </button>
                    <button onClick={async () => {
                      const api = getDesktopAPI()
                      if (!api?.pickExecutable) return
                      const newExe = await api.pickExecutable(activeGame.installDir)
                      if (!newExe) return
                      const updated = getScannedGames().map((g: any) =>
                        g.id === activeGame.id ? { ...g, exePath: newExe } : g
                      )
                      setLocalGames(updated)
                      setScannedGames(updated)
                      toast({ title: 'Executable Updated', description: `Game exe changed to: ${newExe}`, variant: 'success' })
                    }} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/50" title="Choose a different executable">
                      <Search size={13} /> Choose Exe
                    </button>
                    <button onClick={handleActionClick} className="px-5.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
                      <Play size={14} fill="currentColor" /> Play
                    </button>
                    {activeGame.otixMediaId && (
                      <button onClick={() => navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: 'game', mediaId: activeGame.otixMediaId! } } as any)} className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70">
                        <Search size={13} /> Details
                      </button>
                    )}
                  </>
                )
              }
              if (activeGame.isDefault) {
                return (
                  <>
                    <button onClick={handleAddLibrary} className="px-4.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/95">
                      <Plus size={14} /> Add to Library
                    </button>
                    <button onClick={handleActionClick} className="px-5.5 py-2.5 bg-white hover:bg-white/90 text-black rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
                      <Search size={14} /> View Details
                    </button>
                  </>
                )
              }
              if (isIncompatible) {
                return (
                  <button onClick={handleActionClick} className="px-5.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70" disabled>
                    <span className="text-red-400/70">⚠</span> Can't install on macOS
                  </button>
                )
              }
              if (activeGame.platform === 'iso') {
                if (activeInstall) {
                  const message = activeInstall.progress?.message ?? 'Installing...'
                  return (
                    <div className="flex gap-2 items-stretch h-[38px]">
                      <button onClick={() => setIsInstallerOpen(true)} className="relative overflow-hidden px-4 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] text-white w-48 justify-start">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-600/30 animate-pulse pointer-events-none" />
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0 relative z-10" />
                        <div className="flex flex-col items-start relative z-10 text-left min-w-0 leading-tight">
                          <span className="font-bold text-white truncate w-full text-[10px]">Installing...</span>
                          <span className="text-[9px] text-white/50 truncate w-full">{message}</span>
                        </div>
                      </button>
                      <button onClick={() => cancelInstall(activeInstall.isoPath)} className="px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center justify-center" title="Cancel Installation">
                        <X size={14} />
                      </button>
                    </div>
                  )
                }
                return (
                  <>
                    {!activeGame.otixMediaId && (
                      <div className="flex gap-1.5">
                        <button onClick={() => {
                          if (activeGame.rawGame) {
                            matchMutation.mutateAsync([activeGame.rawGame]).then((matched) => {
                              if (matched?.length) {
                                const filtered = matched
                                setLocalGames(filtered)
                                setScannedGames(filtered)
                                syncMutation.mutate(filtered)
                                toast({ title: 'Game Matched', description: `"${matched[0]?.data?.title || matched[0]?.title}" found in catalog.`, variant: 'success' })
                              }
                            }).catch((err) => console.error('[Launcher] Match game failed:', err))
                          }
                        }} className="px-4.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
                          <Search size={14} /> Match Game
                        </button>
                        {activeGame.rawGame?.matchSuggestion && (
                          <button onClick={handleDenySuggestion} className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95" title="Deny this match suggestion">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    )}
                    <button onClick={() => setIsInstallerOpen(true)} className="px-5.5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
                      <Disc size={14} /> Install
                    </button>
                  </>
                )
              }
              // Unmatched local game
              return (
                <div className="flex gap-1.5">
                  <button onClick={() => {
                    if (activeGame.rawGame) {
                      matchMutation.mutateAsync([activeGame.rawGame]).then((matched) => {
                        if (matched?.length) {
                          const filtered = matched
                          setLocalGames(filtered)
                          setScannedGames(filtered)
                          syncMutation.mutate(filtered)
                          toast({ title: 'Game Matched', description: `"${matched[0]?.data?.title || matched[0]?.title}" found in catalog.`, variant: 'success' })
                        }
                      }).catch((err) => console.error('[Launcher] Match game failed:', err))
                    }
                  }} className="px-5.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
                    <Search size={14} /> Match Game
                  </button>
                  {activeGame.rawGame?.matchSuggestion && (
                    <button onClick={handleDenySuggestion} className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95" title="Deny this match suggestion">
                      <X size={13} />
                    </button>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Install verification prompt */}
          {foundInstall?.exePath && !activeGame.isInstalled && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 backdrop-blur-md space-y-2.5 w-[280px] text-left">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-[11px] font-black tracking-wider uppercase text-white/90">Game Detected</span>
              </div>
              <p className="text-[10px] text-white/60 leading-normal">Files found in install folder. Is this game fully installed?</p>
              <div className="flex gap-2">
                <button onClick={handleConfirmInstalled} className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all text-white font-bold text-[9px] rounded-lg px-2.5 py-1.5 cursor-pointer">
                  <Play size={11} fill="currentColor" /> Yes, Launch
                </button>
                <button onClick={handleDismissInstallFound} className="flex-1 inline-flex items-center justify-center gap-1 bg-white/8 hover:bg-white/12 active:scale-95 transition-all text-white/70 font-bold text-[9px] rounded-lg px-2.5 py-1.5 cursor-pointer">
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
                <p className="text-[10px] text-white/50 leading-normal">This is an online-only multiplayer service game. Progress and saves are managed directly by the server.</p>
              </div>
            ) : (
              <div className="mt-4 p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md space-y-3 w-[280px] text-left">
                <div className="flex items-center gap-2">
                  <Cloud size={14} className="text-[#4285F4]" />
                  <span className="text-[11px] font-black tracking-wider uppercase text-white/90">Google Drive Sync</span>
                  {user?.googleId && (
                    <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-md px-1.5 py-0.5">Connected</span>
                  )}
                </div>

                {!user?.googleId ? (
                  <div className="space-y-2">
                    <p className="text-[10px] text-white/50 leading-normal">Link your Google account in Settings to enable Cloud Save backups for your games.</p>
                    <Link to="/settings" search={{ section: "integrations" }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4285F4] hover:bg-[#4285F4]/90 active:scale-95 transition-all px-3 py-1.5 text-[10px] font-bold text-white cursor-pointer">
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
                          <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5"><Check size={10} /> Confirmed</span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-400 flex items-center gap-0.5"><AlertCircle size={10} /> Unconfirmed</span>
                        )}
                      </div>

                      {cloudSettings?.isPathConfirmed ? (
                        <div className="space-y-1">
                          <p className="text-[9px] text-white/60 bg-white/5 border border-white/10 rounded px-1.5 py-1 font-mono break-all leading-tight">{cloudSettings.confirmedPath}</p>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={handleSelectFolder} className="text-[9px] text-white/50 hover:text-white/80 transition-all font-semibold underline cursor-pointer">Change folder</button>
                            {overridePath && (
                              <button type="button" onClick={handleClearOverride} className="text-[9px] text-rose-400/70 hover:text-rose-400 transition-all font-semibold underline cursor-pointer">Clear override</button>
                            )}
                          </div>
                        </div>
                      ) : detectedPath ? (
                        <div className="space-y-1.5">
                          <p className="text-[9px] text-white/60 bg-white/5 border border-white/10 rounded px-1.5 py-1 font-mono break-all leading-tight">{detectedPath}</p>
                          <div className="flex items-center gap-2">
                            <button type="button" disabled={confirmingPath || resolvingServerPaths} onClick={() => handleConfirmPath(detectedPath)} className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer disabled:opacity-40">
                              {confirmingPath ? "Confirming..." : "Confirm Folder"}
                            </button>
                            <button type="button" onClick={handleSelectFolder} className="inline-flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer">
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
                          <button type="button" onClick={handleSelectFolder} className="inline-flex items-center justify-center bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white font-bold text-[9px] rounded px-2.5 py-1 cursor-pointer">
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
                      <button type="button" onClick={() => handleToggleAutoSync(!(cloudSettings?.autoSync))}
                        className={cn("relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer", cloudSettings?.autoSync ? "bg-emerald-500" : "bg-white/10")}>
                        <span className={cn("inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200", cloudSettings?.autoSync ? "translate-x-3.5" : "translate-x-0.5")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button type="button" disabled={syncing} onClick={handleSyncNow}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg text-[10px] font-bold text-white transition-all cursor-pointer disabled:opacity-40 active:scale-95">
                        <RefreshCw size={11} className={cn("text-white/60", syncing && "animate-spin")} />
                        {syncing ? "Syncing..." : "Sync Now"}
                      </button>
                      <div className="text-right">
                        {cloudSettings?.lastSyncAt ? (
                          <span className="text-[9px] text-white/40 block leading-none">Synced {new Date(cloudSettings.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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

      {/* ISO Installer Modal (self-contained) */}
      <IsoInstallerModal
        open={isInstallerOpen}
        onClose={() => setIsInstallerOpen(false)}
        games={localGames}
        initialIsoPath={activeGame?.rawGame?.exePath || undefined}
        onInstallComplete={() => {
          // ISO installer calls markGameInstalled -> setScannedGames -> game:updated event
          // Our game:updated listener picks it up, no extra state needed
        }}
      />
    </section>
  )
}
