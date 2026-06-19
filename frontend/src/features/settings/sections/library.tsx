import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { Scan, Folder, Disc, Gamepad2, X, CheckCircle2, Loader2, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionHeader } from '../components/section-header'
import { getScanPaths, getIsoPaths, setScanPaths, setIsoPaths } from '@/old-features/game-scanner/storage'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { useMatchLocalGames } from '@/old-features/game-scanner/queries'
import { useClaimGame } from '@/old-features/library/library-queries'
import type { LocalGame } from '@/old-features/game-scanner/types'
import { getDesktopAPI, hasDesktopAPI, isDesktop } from '@/lib/desktop/api'

// ── Helpers ───────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done' | 'error'
type PathEntry = { path: string; scanState: ScanState }

function usePathList(
  initialGetter: () => string[],
  setter: (paths: string[]) => void,
  _storageKey: string,
) {
  const [paths, setPaths] = useState<PathEntry[]>(() =>
    initialGetter().map((p) => ({ path: p, scanState: 'idle' as ScanState }))
  )

  const addPath = useCallback(async () => {
    if (!hasDesktopAPI()) return
    const dir = await window.desktopAPI!.selectDirectory()
    if (!dir) return
    setPaths((prev) => {
      if (prev.some((p) => p.path === dir)) return prev
      const next = [...prev, { path: dir, scanState: 'idle' as ScanState }]
      setter(next.map((p) => p.path))
      return next
    })
  }, [setter])

  const removePath = useCallback((path: string) => {
    setPaths((prev) => {
      const next = prev.filter((p) => p.path !== path)
      setter(next.map((p) => p.path))
      return next
    })
  }, [setter])

  const setScanStateFor = useCallback((path: string, state: ScanState) => {
    setPaths((prev) =>
      prev.map((p) => (p.path === path ? { ...p, scanState: state } : p))
    )
  }, [])

  return { paths, setPaths, addPath, removePath, setScanStateFor }
}

// ── Scanner sub-section ───────────────────────────────────────────────────

function ScannersSection() {
  const { data: serverGames = [] } = useLocalGames()
  const [scannedGames, setScannedGamesLocal] = useState<LocalGame[]>(serverGames)
  const [batchScanning, setBatchScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const gamesUnsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setScannedGamesLocal(serverGames)
  }, [serverGames])

  const gamePaths = usePathList(getScanPaths, (p) => setScanPaths(p), 'gamePaths')
  const isoPaths = usePathList(getIsoPaths, (p) => setIsoPaths(p), 'isoPaths')

  const navigate = useNavigate()
  const matchMutation = useMatchLocalGames()
  const claimMutation = useClaimGame()
  const [matching, setMatching] = useState(false)

  // Subscribe to scanner progress and games-updated events
  useEffect(() => {
    if (!hasDesktopAPI()) return
    const api = window.desktopAPI as any
    unsubRef.current = api.onScannerProgress?.((data: { currentDir: string; progress: number }) => {
      setScanProgress(data.currentDir)
    })
    gamesUnsubRef.current = api.onGamesUpdated?.(() => {
      // Refresh games list after scan completes
      getDesktopAPI()?.getScannedGames().then((games) => {
        if (games?.length) setScannedGamesLocal(games)
      }).catch(() => {})
    })
    return () => {
      unsubRef.current?.()
      gamesUnsubRef.current?.()
    }
  }, [])

  const doScan = useCallback(async (targetGamePaths: string[], targetIsoPaths: string[], onDone?: () => void) => {
    if (!hasDesktopAPI()) return
    try {
      const api = getDesktopAPI()!
      const games = await api.scanPaths(targetGamePaths, targetIsoPaths)
      if (games?.length) {
        setScannedGamesLocal(games)
      }
    } catch (err) {
      console.error('Scan failed:', err)
    } finally {
      onDone?.()
    }
  }, [])

  const handleScanAll = useCallback(async () => {
    if (batchScanning) return
    setBatchScanning(true)
    setScanProgress('Starting scan...')
    try {
      await doScan(
        gamePaths.paths.map((p) => p.path),
        isoPaths.paths.map((p) => p.path),
      )
    } finally {
      setBatchScanning(false)
      setScanProgress(null)
    }
  }, [batchScanning, gamePaths.paths, isoPaths.paths, doScan])

  const handleScanPath = useCallback(async (path: string, isIso: boolean) => {
    gamePaths.setScanStateFor(path, 'scanning')
    isoPaths.setScanStateFor(path, 'scanning')
    setScanProgress(path)
    try {
      await doScan(
        isIso ? [] : [path],
        isIso ? [path] : [],
      )
      gamePaths.setScanStateFor(path, 'done')
      isoPaths.setScanStateFor(path, 'done')
    } catch {
      gamePaths.setScanStateFor(path, 'error')
      isoPaths.setScanStateFor(path, 'error')
    } finally {
      setScanProgress(null)
    }
  }, [doScan, gamePaths, isoPaths])

  const handleMatchAll = useCallback(async () => {
    setMatching(true)
    try {
      const result = await matchMutation.mutateAsync(scannedGames)
      if (!result) return
      setScannedGamesLocal(result)
    } catch (err) {
      console.error('Match failed:', err)
    } finally {
      setMatching(false)
    }
  }, [scannedGames, matchMutation])

  const handleVerifyAll = useCallback(() => {
    const newlyClaimed: string[] = []
    const withClaimed = scannedGames.map((g) => {
      if (!g.data?.id || g.otixMatchVerified) return g
      newlyClaimed.push(g.data?.id)
      return { ...g, otixMatchVerified: true, otixClaimed: true }
    })
    setScannedGamesLocal(withClaimed)
    for (const mediaId of newlyClaimed) {
      claimMutation.mutate({ mediaType: 'game', mediaId })
    }
  }, [scannedGames, claimMutation])

  const anyScanning = batchScanning ||
    [...gamePaths.paths, ...isoPaths.paths].some((p) => p.scanState === 'scanning')
  const totalPaths = gamePaths.paths.length + isoPaths.paths.length

  if (!isDesktop()) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-white/20" />
        <div>
          <p className="text-sm font-medium text-white">Desktop Only</p>
          <p className="text-xs text-white/60 mt-1">
            Library management is only available in the desktop app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Scan All card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <SectionHeader
              title="Scan Paths"
              description={
                totalPaths === 0
                  ? 'No scan paths configured. Add game or ISO directories below.'
                  : `${totalPaths} path${totalPaths !== 1 ? 's' : ''} configured · ${scannedGames.length} game${scannedGames.length !== 1 ? 's' : ''} discovered`
              }
            />
          </div>
          <button
            onClick={handleScanAll}
            disabled={anyScanning || totalPaths === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ml-4"
          >
            {batchScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            {batchScanning ? 'Scanning...' : 'Scan All'}
          </button>
        </div>
        {batchScanning && scanProgress && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <Loader2 className="h-3 w-3 animate-spin" />
            Scanning: {scanProgress}
          </div>
        )}
      </div>

      {/* Game Scan Paths */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Game Directories"
          description="Folders where Otix looks for installed games (.exe files)."
        />
        <div className="space-y-2">
          {gamePaths.paths.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Folder className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm truncate text-white/80">{entry.path}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {entry.scanState === 'scanning' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <button
                    onClick={() => handleScanPath(entry.path, false)}
                    disabled={anyScanning}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                    title="Scan this directory"
                  >
                    <Scan className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => gamePaths.removePath(entry.path)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                  title="Remove path"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={gamePaths.addPath}
          disabled={!hasDesktopAPI()}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add Game Directory
        </button>
      </div>

      {/* ISO Mount Paths */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="ISO Directories"
          description="Folders containing ISO files to scan, mount, and install."
        />
        <div className="space-y-2">
          {isoPaths.paths.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Disc className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm truncate text-white/80">{entry.path}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {entry.scanState === 'scanning' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <button
                    onClick={() => handleScanPath(entry.path, true)}
                    disabled={anyScanning}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                    title="Scan this directory"
                  >
                    <Scan className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => isoPaths.removePath(entry.path)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
                  title="Remove path"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={isoPaths.addPath}
          disabled={!hasDesktopAPI()}
          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <Disc className="h-3.5 w-3.5" />
          Add ISO Directory
        </button>
      </div>

      {/* Discovered Games */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Discovered Games"
          description={
            scannedGames.length === 0
              ? 'No games found yet. Add scan paths above and click Scan All to discover installed games.'
              : `${scannedGames.length} game${scannedGames.length !== 1 ? 's' : ''} found on your system.`
          }
        />
        {scannedGames.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleMatchAll}
              disabled={matching}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-40"
            >
              {matching && <Loader2 className="h-4 w-4 animate-spin" />}
              Match All to Catalog
            </button>
            <button
              onClick={handleVerifyAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify All Matches
            </button>
            <button
              onClick={() => navigate({ to: '/settings/library/matching' })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
            >
              <Gamepad2 className="h-4 w-4" />
              View Matching
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────

export function LibrarySection() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeSubTab = location.pathname.includes('/matching') ? 'matching' : 'library'

  const SUB_TABS = [
    { id: 'library', label: 'Library', path: '/settings/library' },
    { id: 'matching', label: 'Matching', path: '/settings/library/matching' },
  ]

  return (
    <div className="space-y-8">
      {/* Sub-tab navigation */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate({ to: tab.path })}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                activeSubTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* If activeSubTab is library, render scan content */}
        {activeSubTab === 'library' && (
          <>
            <h2 className="text-lg font-semibold text-white tracking-tight">Library</h2>
            <p className="text-sm mt-1 text-white/60">
              Manage installed games and scan for new ones.
            </p>
          </>
        )}
      </div>

      {activeSubTab === 'library' && <ScannersSection />}
    </div>
  )
}
