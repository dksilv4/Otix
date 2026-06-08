/* ── useLocalGames — manages scanned games state, scanning, matching, sorting ── */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop-api'
import { useToast } from '@/features/dk-ui/molecules/toast'
import type { LocalGame, LauncherPlatform } from '@/features/games/types'
import type { CatalogGame } from '@/features/games/types'
import { useGames, useRejectSuggestion } from '@/features/game-scanner/game-queries'
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
  sortBy?: (games: DisplayGame[]) => DisplayGame[]
}

export interface UseLocalGamesReturn {
  localGames: LocalGame[]
  scanning: boolean
  activeGameId: string | null
  setActiveGameId: (id: string | null) => void
  activeGame: DisplayGame | null
  displayGames: DisplayGame[]
  pickerGames: DisplayGame[]
  foundInstall: { exePath: string; installKey: string } | null

  handleScan: () => Promise<void>
  handleInstallComplete: (isoPath: string, installDir: string, gameExe: string | null) => void
  handleConfirmInstalled: () => void
  handleDismissInstallFound: () => void
  handleDenySuggestion: () => void

  matchMutation: UseMutationResult<LocalGame[], Error, LocalGame[], unknown>
  syncMutation: UseMutationResult<void, Error, LocalGame[], unknown>

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

  const { data: localGames = [] } = useGames()
  const rejectSuggestionMutation = useRejectSuggestion()
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const { installs } = useInstallProgress()

  // ── Core state ──

  const [scanning, setScanning] = useState(false)
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [foundInstall, setFoundInstall] = useState<{ exePath: string; installKey: string } | null>(null)
  const checkedGameDirs = useRef(new Set<string>(
    (() => {
      try { return JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]') }
      catch { return [] }
    })(),
  ))

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

  const handleConfirmInstalled = useCallback(() => {
    if (!activeGame || !foundInstall) return
    const { exePath, installKey } = foundInstall
    const api = getDesktopAPI()
    if (api?.launchGame) {
      api.launchGame({ exePath } as LocalGame).catch(console.error)
      toast({ title: 'Launching Game', description: 'Running installed executable...', variant: 'success' })
    }
    setFoundInstall(null)
    try {
      const dismissed = JSON.parse(localStorage.getItem('otix_verify_dismissed') || '[]')
      const kept = dismissed.filter((k: string) => k !== installKey)
      localStorage.setItem('otix_verify_dismissed', JSON.stringify(kept))
    } catch { /* ignore */ }
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
    // ISO installer calls markGameInstalled -> setScannedGames -> DB write -> auto-refetch
  }, [])

  const handleScan = useCallback(async () => {
    if (!hasDesktopAPI()) {
      toast({ title: 'Scanner Simulated', description: 'Web preview mode: Scanned 0 local game directories.', variant: 'info' })
      return
    }
    setScanning(true)
    try {
      const api = getDesktopAPI()!
      const paths = await api.getScanPaths()
      const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
      const isoPaths = paths.filter((p) => p.type === 'iso').map((p) => p.path)
      const scanned = await api.scanPaths(gamePaths, isoPaths)
      // DB-change event triggers auto-refetch
      if (scanned?.length) {
        toast({ title: 'Scan Complete', description: `Successfully scanned and loaded ${scanned.length} local games.`, variant: 'success' })
        if (scanned.length > 0) setActiveGameId(scanned[0].id)
      } else {
        toast({ title: 'Scan Complete', description: 'No local games were detected.', variant: 'default' })
      }
    } catch (err) {
      console.error('Scan failed:', err)
      toast({ title: 'Scan Failed', description: 'An error occurred while scanning folders.', variant: 'error' })
    } finally {
      setScanning(false)
    }
  }, [toast])

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
    setLocalGames: () => {}, // no-op — data is managed by useGames() query
  }
}
