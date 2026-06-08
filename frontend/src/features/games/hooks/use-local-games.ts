/* ── useLocalGames — manages scanned games state, scanning, matching, sorting ── */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop-api'
import { useToast } from '@/features/dk-ui/molecules/toast'
import type { LocalGame, LauncherPlatform } from '@/features/games/types'
import type { CatalogGame } from '@/features/games/types'
import {
  getScannedGames,
  setScannedGames,
  getScanPaths,
  getIsoPaths,
  filterRejectedSuggestions,
  rejectSuggestion,
} from '@/features/game-scanner/storage'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/game-scanner/queries'
import type { UseMutationResult } from '@tanstack/react-query'
import { useInstallProgress } from '@/features/game-scanner/install-store'

/* ── Types ── */

export interface DisplayGame {
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
  isDefault: boolean
  platform: LauncherPlatform
  exePath?: string
  installDir?: string
  isInstalled?: boolean
  otixMediaId?: string
  rawGame?: LocalGame
}

export interface UseLocalGamesOptions {
  /** Custom sort applied to matched picker games. Default: installed first, original order. */
  sortBy?: (games: DisplayGame[]) => DisplayGame[]
}

export interface UseLocalGamesReturn {
  /** Raw scanned games */
  localGames: LocalGame[]
  /** Whether a scan is in progress */
  scanning: boolean
  /** Currently selected game ID */
  activeGameId: string | null
  /** Select a game by ID */
  setActiveGameId: (id: string | null) => void
  /** Currently active display game (resolved from activeGameId) */
  activeGame: DisplayGame | null
  /** All display games merged from local + catalog fallback */
  displayGames: DisplayGame[]
  /** Matched games sorted by sortBy (default: installed first) */
  pickerGames: DisplayGame[]
  /** Install verification state — game files detected but not marked installed */
  foundInstall: { exePath: string; installKey: string } | null

  /** Trigger a scan of configured paths */
  handleScan: () => Promise<void>
  /** Called by IsoInstallerModal when ISO install succeeds */
  handleInstallComplete: (isoPath: string, installDir: string, gameExe: string | null) => void
  /** Confirm game is installed — updates state and launches */
  handleConfirmInstalled: () => void
  /** Dismiss the install-found prompt */
  handleDismissInstallFound: () => void
  /** Deny a match suggestion */
  handleDenySuggestion: () => void

  /** Match mutation — match local games against catalog */
  matchMutation: UseMutationResult<LocalGame[], Error, LocalGame[], unknown>
  /** Sync mutation — sync matched local games to backend */
  syncMutation: UseMutationResult<void, Error, LocalGame[], unknown>

  /** Set scanned games directly (e.g. after match mutation resolves) */
  setLocalGames: React.Dispatch<React.SetStateAction<LocalGame[]>>
}

/* ── Helpers ── */

function defaultSort(games: DisplayGame[]): DisplayGame[] {
  return [...games].sort((a, b) => {
    if (a.isInstalled && !b.isInstalled) return -1
    if (!a.isInstalled && b.isInstalled) return 1
    return a.title.localeCompare(b.title)
  })
}

/* ── Hook ── */

export function useLocalGames(
  popularGames: CatalogGame[] = [],
  options: UseLocalGamesOptions = {},
): UseLocalGamesReturn {
  const { toast } = useToast()
  const sortBy = options.sortBy ?? defaultSort

  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const { installs } = useInstallProgress()

  // ── Core state ──

  const [localGames, setLocalGames] = useState<LocalGame[]>(() => getScannedGames())
  const [scanning, setScanning] = useState(false)
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [foundInstall, setFoundInstall] = useState<{ exePath: string; installKey: string } | null>(null)
  const checkedGameDirs = useRef(new Set<string>(
    (() => {
      try { return JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]') }
      catch { return [] }
    })(),
  ))

  // ── Effects ──

  // Re-sync from cache on mount + listen for external updates
  useEffect(() => {
    const reload = () => setLocalGames(getScannedGames())
    const timerId = setTimeout(reload, 100)
    const onGamesUpdated = () => { clearTimeout(timerId); reload() }
    window.addEventListener('games:updated', onGamesUpdated)
    window.addEventListener('game:updated', onGamesUpdated)
    return () => {
      clearTimeout(timerId)
      window.removeEventListener('games:updated', onGamesUpdated)
      window.removeEventListener('game:updated', onGamesUpdated)
    }
  }, [])

  // Match all local games against catalog on mount
  useEffect(() => {
    if (localGames.length === 0) return
    matchMutation.mutateAsync(localGames).then((matched) => {
      if (matched?.length) {
        const filtered = filterRejectedSuggestions(matched)
        const current = getScannedGames()
        const merged = filtered.map((g) => {
          const existing = current.find((c) => c.id === g.id || c.exePath === g.exePath)
          if (existing && existing.platform !== g.platform && existing.platform !== 'iso') {
            return { ...g, platform: existing.platform, exePath: existing.exePath, installDir: existing.installDir }
          }
          return g
        })
        setLocalGames(merged)
        setScannedGames(merged)
        syncMutation.mutate(merged)
      }
    }).catch((err) => console.error('[LocalGames] Match failed:', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh localGames from cache when ISO installs complete
  const completedInstallPaths = useRef(new Set<string>())
  useEffect(() => {
    for (const inst of installs) {
      if (!inst.active && inst.result?.success && !completedInstallPaths.current.has(inst.isoPath)) {
        completedInstallPaths.current.add(inst.isoPath)
        setLocalGames(getScannedGames())
      }
    }
  }, [installs])

  // ── Derived data ──

  const displayGames = useMemo<DisplayGame[]>(() => {
    if (localGames.length > 0) {
      return localGames.map((g) => {
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
      })
    }
    // Fall back to popular catalog games
    return popularGames.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      posterUrl: p.posterUrl || null,
      backdropUrl: undefined,
      logoUrl: undefined,
      iconUrl: undefined,
      badge: p.avgRating
        ? `★ ${p.avgRating.toFixed(1)} · ${p.ratingCount.toLocaleString()} ratings`
        : p.popularity > 200 ? 'Popular' : 'Featured',
      playtime: '—',
      achievements: p.avgRating ? `${Math.round(p.avgRating * 10)}%` : '—',
      isDefault: true,
      platform: 'pc' as LauncherPlatform,
      otixMediaId: p.id,
    }))
  }, [localGames, popularGames])

  const pickerGames = useMemo<DisplayGame[]>(() => {
    const matched = displayGames.filter((g) => !!g.otixMediaId)
    return sortBy(matched)
  }, [displayGames, sortBy])

  const activeGame = useMemo<DisplayGame | null>(() => {
    if (!activeGameId) return pickerGames[0] || null
    return displayGames.find((g) => g.id === activeGameId) || pickerGames[0] || null
  }, [displayGames, pickerGames, activeGameId])



  // ── Handlers ──

  // Install verification handlers
  const handleConfirmInstalled = useCallback(() => {
    if (!activeGame || !foundInstall) return
    const { exePath, installKey } = foundInstall
    setLocalGames((prev) => {
      const updated = prev.map((g) => {
        if (g.id === activeGame.id || g.exePath === activeGame.exePath) {
          return { ...g, platform: 'pc' as const, exePath, installDir: activeGame.installDir || g.installDir }
        }
        return g
      })
      setScannedGames(updated)
      return updated
    })
    setFoundInstall(null)
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      const kept = dismissed.filter((k: string) => k !== installKey)
      localStorage.setItem('otix_verify_dismissed', JSON.stringify(kept))
    } catch { /* ignore */ }

    const api = getDesktopAPI()
    if (api?.launchGame) {
      console.log('[Play] handleConfirmInstalled launchGame exePath:', exePath)
      api!.launchGame({ exePath } as LocalGame).catch(console.error)
      toast({ title: 'Launching Game', description: 'Running installed executable...', variant: 'success' })
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
    } catch { /* ignore */ }
    checkedGameDirs.current.add(installKey)
    setFoundInstall(null)
  }, [foundInstall])

  const handleInstallComplete = useCallback((isoPath: string, installDir: string, gameExe: string | null) => {
    const normIso = isoPath.replace(/\\/g, '/').toLowerCase()
    setLocalGames((prev) => {
      const updated = prev.map((g) => {
        const normExe = g.exePath.replace(/\\/g, '/').toLowerCase()
        if (normExe === normIso) {
          return { ...g, platform: 'pc' as const, exePath: gameExe ?? g.exePath, installDir }
        }
        return g
      })
      setScannedGames(updated)
      return updated
    })
  }, [])

  const handleScan = useCallback(async () => {
    if (!hasDesktopAPI()) {
      toast({ title: 'Scanner Simulated', description: 'Web preview mode: Scanned 0 local game directories.', variant: 'info' })
      return
    }
    setScanning(true)
    try {
      const api = getDesktopAPI()!
      const scanned = await api.scanPaths(getScanPaths(), getIsoPaths())
      if (scanned?.length) {
        const matched = await matchMutation.mutateAsync(scanned)
        if (matched?.length) {
          const filtered = filterRejectedSuggestions(matched)
          setLocalGames(filtered)
          setScannedGames(filtered)
          toast({ title: 'Scan Complete', description: `Successfully scanned and loaded ${filtered.length} local games.`, variant: 'success' })
          if (filtered.length > 0) setActiveGameId(filtered[0].id)
        }
      } else {
        toast({ title: 'Scan Complete', description: 'No local games were detected.', variant: 'default' })
      }
    } catch (err) {
      console.error('Scan failed:', err)
      toast({ title: 'Scan Failed', description: 'An error occurred while scanning folders.', variant: 'error' })
    } finally {
      setScanning(false)
    }
  }, [matchMutation, toast])

  const handleDenySuggestion = useCallback(() => {
    if (!activeGame?.rawGame?.matchSuggestion) return
    rejectSuggestion(activeGame.rawGame, activeGame.rawGame.matchSuggestion.id)
    setLocalGames(getScannedGames())
    toast({
      title: 'Suggestion Dismissed',
      description: "Match suggestion hidden. It won't reappear on future scans.",
      variant: 'default',
    })
  }, [activeGame, toast])
  useEffect(() => {
    console.log('[LocalGames] Active game changed:', activeGameId)
  }, [activeGame]);
  return {
    localGames,
    scanning,
    activeGameId,
    setActiveGameId,
    activeGame,
    displayGames,
    pickerGames,
    foundInstall,
    matchMutation,
    syncMutation,
    handleScan,
    handleInstallComplete,
    handleConfirmInstalled,
    handleDismissInstallFound,
    handleDenySuggestion,
    setLocalGames,
  }
}
