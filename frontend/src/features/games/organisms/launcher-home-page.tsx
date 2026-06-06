/* ── LauncherHomePage — fullscreen game launcher driven by real database & scanner data ── */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import {
  Gamepad2,
  Scan,
  HardDrive,
  Play,
  Plus,
  Search,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useDesktopPlatform } from '@/lib/desktop-platform'
import {
  getScannedGames,
  setScannedGames,
  getScanPaths,
  getIsoPaths,
  hasDesktopAPI,
  filterRejectedSuggestions
} from '@/features/games/scanner/storage'
import type { DetectedGame } from '@/features/games/scanner/types'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/games/scanner/queries'
import { usePopularGames, useGameDetail } from '@/features/games/games-queries'
import { useClaimGame } from '@/features/library/library-queries'
import { useToast } from '@/features/dk-ui/molecules/toast'

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

/* ── GamePickerThumb — renders both icon and poster, icon shown first ── */

function GamePickerThumb({ icon, poster, alt }: { icon?: string | null; poster?: string | null; alt: string }) {
  return (
    <div className="w-full h-full relative">
      {poster && (
        <img
          src={poster}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {icon && (
        <img
          src={icon}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover z-10"
          onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
        />
      )}
      {!icon && !poster && (
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

  // Selection states
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [shelfTab, setShelfTab] = useState<'popular' | 'downloaded' | 'rated'>('popular')

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
        setLocalGames(filtered)
        setScannedGames(filtered)
        syncMutation.mutate(filtered)
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
          isInstalled: !!g.exePath,
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

  // Picker sidebar: show local games (matched or not), or fallback to catalog
  // Sort: installed first, then matched, then unmatched
  const pickerGames = useMemo<DisplayGame[]>(
    () => {
      const games = localGames.length > 0
        ? displayGames
        : displayGames.filter((g) => !!g.otixMediaId)
      return [...games].sort((a, b) => {
        // Installed games first
        if (a.isInstalled && !b.isInstalled) return -1
        if (!a.isInstalled && b.isInstalled) return 1
        // Matched before unmatched
        if (a.otixMediaId && !b.otixMediaId) return -1
        if (!a.otixMediaId && b.otixMediaId) return 1
        // Then by original order
        return 0
      })
    },
    [displayGames, localGames.length],
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

  // Query details for active game from backend
  const { data: activeGameDetail } = useGameDetail(activeGame?.otixMediaId)

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
          (window as any).desktopAPI.launchGame(activeGame.rawGame).catch(console.error)
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
          top: '6.5rem',
          maxHeight: 'calc(100vh - 7.5rem)',
        }}
      >
        {/* Game Cover Thumbnails Stack */}
        <div className="flex-1 min-h-0 flex flex-col items-center gap-3 overflow-y-scroll overflow-x-hidden scrollbar-none w-full px-1.5 pt-4 pb-20">
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
                  <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500/60 border border-black/30 shadow-sm" title={`Can install on ${osName}`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Bottom Library button (absolute) */}
        <button
          onClick={goToLibrary}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white hover:text-white cursor-pointer transition-all bg-[var(--color-accent)]"
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

          {/* Animated Background Art */}
          <AnimatePresence mode="wait">
            {backdropUrl ? (
              <motion.div
                key={activeGame.id}
                initial={{ opacity: 0, scale: 1.01 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 z-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${backdropUrl})` }}
              />
            ) : null}
          </AnimatePresence>

          {/* Gradients overlay for legibility */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/20 z-1 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent z-1 pointer-events-none" />

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
                  {activeGameDetail?.steamPlaytimeForever != null
                    ? (() => {
                        const hours = Math.round(activeGameDetail.steamPlaytimeForever! / 60)
                        const mins = activeGameDetail.steamPlaytimeForever! % 60
                        return hours >= 1
                          ? `${hours}h ${mins}m`
                          : `${mins}m`
                      })()
                    : '—'}
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
                      ) : activeGame.platform === 'iso' ? (
                        <><span className="text-amber-400">○</span> ISO — install on {osName}</>
                      ) : (
                        <><span className="text-white/30">○</span> Not Installed</>
                      )}
                    </p>
                    <p className="text-[9px] font-black text-white/30 tracking-widest uppercase">
                      {activeGame.isInstalled ? 'Ready to play' : activeGame.installDir ? `At ${activeGame.installDir}` : 'Local game'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Developer / Publisher (Bottom Right) */}
            {activeGameDetail?.involvedCompanies?.length > 0 && (
              <div className="absolute bottom-8 right-8 pointer-events-auto">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-end max-w-xs">
                  {["developer", "publisher"].filter(r => activeGameDetail!.involvedCompanies.some(c => (c as any)[r])).map((role) => (
                    <span key={role} className="text-[10px] text-white/35">
                      <span className="uppercase tracking-wider">{role}</span>{' '}
                      <span className="text-white/60">
                        {activeGameDetail!.involvedCompanies.filter(c => (c as any)[role]).map(c => c.company.name).join(", ")}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Game Info & Action Buttons (Center Right) */}
            <div className="absolute right-8 top-1/2 -translate-y-[35%] flex flex-col items-end text-right max-w-sm pointer-events-auto">
              {(activeGameDetail?.logoUrl || activeGame.logoUrl) ? (
                <img
                  src={activeGameDetail?.logoUrl || activeGame.logoUrl}
                  alt={activeGame.title}
                  className="h-24 object-contain mb-4 drop-shadow-[0_4px_20px_rgba(0,0,0,0.7)] max-w-[340px]"
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

              {/* Action Buttons */}
              <div className="flex gap-2.5 items-center justify-end">
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
                  {activeGame.isDefault ? <Search size={14} /> : <Play size={14} fill="currentColor" />}
                  {activeGame.isDefault ? 'View Details' : 'Play Game'}
                </button>
              </div>
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
    </div>
  )
}
