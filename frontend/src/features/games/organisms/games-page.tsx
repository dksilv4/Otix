import { useState, useEffect, useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { Gamepad2, RefreshCw, Play, Folder, Star, Menu, X, Cloud, Link2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { useGames } from "../hooks/use-games"
import { GamesSidePanel } from "./games-side-panel"
import { GamesShelf } from "./games-shelf"
import type { DetectedGame } from "@/features/game-scanner/types"
import { useAuth } from "@/features/auth/auth-provider"
import { API_BASE_URL } from "@/lib/api-client"

// ── Hero — full game detail panel ──────────────────────────────────

function HeroPanel({
  game,
  detail,
  onPlay,
  onOpenFolder,
  onAcceptSuggestion,
  onRejectSuggestion,
  onTogglePanel,
  sidePanelOpen,
}: {
  game: DetectedGame | null
  detail?: any
  onPlay: (game: DetectedGame) => void
  onOpenFolder: (game: DetectedGame) => void
  onAcceptSuggestion?: (game: DetectedGame) => void
  onRejectSuggestion?: (game: DetectedGame) => void
  onTogglePanel: () => void
  sidePanelOpen: boolean
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const { user } = useAuth()
  const [cloudSettings, setCloudSettings] = useState<{ gameId: string; autoSync: boolean; lastSyncAt: string | null } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!game?.id || !window.desktopAPI) return

    setCloudSettings(null)
    setSyncError(null)
    setSuccessMsg(null)

    window.desktopAPI.saveGetCloudSettings(game.id)
      .then((settings) => {
        setCloudSettings(settings)
      })
      .catch((err) => {
        console.error('Failed to get cloud settings', err)
      })
  }, [game?.id])

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!game?.id || !window.desktopAPI) return
    try {
      await window.desktopAPI.saveSetCloudSettings(game.id, checked)
      setCloudSettings((prev) => prev ? { ...prev, autoSync: checked } : null)
    } catch (err: any) {
      console.error('Failed to set cloud settings', err)
    }
  }

  const handleSyncNow = async () => {
    if (!game?.id || !window.desktopAPI) return
    setSyncing(true)
    setSyncError(null)
    setSuccessMsg(null)
    try {
      const token = localStorage.getItem('otix-access-token') || ''
      const res = await window.desktopAPI.saveSyncCloud(
        game.id,
        game.title,
        'default',
        API_BASE_URL,
        token ? `Bearer ${token}` : ''
      )
      if (res.success) {
        setSuccessMsg(res.message || 'Sync successful!')
        const updated = await window.desktopAPI.saveGetCloudSettings(game.id)
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

  if (!game) {
    return (
      <div className="flex-1 rounded-2xl bg-[var(--dk-surface-base)] flex flex-col items-center justify-center min-h-[280px] gap-3">
        <Gamepad2 size={40} className="opacity-15" />
        <p className="text-sm text-muted-foreground">No games found</p>
        <p className="text-xs text-muted-foreground/50 max-w-[240px] text-center leading-relaxed">
          Add game folders in Settings → Scanners and run a scan to populate your library.
        </p>
      </div>
    )
  }

  const isMatched = !!game.otixMediaId
  const hasSuggestion = !!game.otixMatchSuggestion
  const isSolelyMultiplayer = useMemo(() => {
    if (!detail?.gameModes || detail.gameModes.length === 0) return false
    const modes = detail.gameModes.map((m: any) => m.gameMode.slug)
    const hasSinglePlayer = modes.includes('single-player')
    const hasMultiplayer = modes.some((slug: string) => 
      slug.includes('multiplayer') || 
      slug.includes('co-op') || 
      slug.includes('co-operative') || 
      slug.includes('mmo') || 
      slug.includes('battle-royale')
    )
    return hasMultiplayer && !hasSinglePlayer
  }, [detail])
  // Steam Grid image → catalog textless poster, then catalog poster, then local poster, then icon
  const gridImage = detail?.textlessPosterUrl ?? detail?.posterUrl ?? game.otixPosterUrl ?? game.posterUrl ?? game.iconUrl
  const installDir = game.installDir.split(/[\/]/).slice(-2).join(" / ")

  // Backdrop from catalog detail
  const backdropUrl = detail?.backdropUrl
  const heroBg = backdropUrl
    ? `linear-gradient(to top, rgba(8,8,18,0.95) 0%, rgba(8,8,18,0.7) 40%, rgba(8,8,18,0.3) 100%), url(${backdropUrl}) center / cover`
    : undefined

  return (
    <div
      className="flex-1 rounded-2xl overflow-hidden relative min-h-[320px] bg-[var(--dk-surface-base)]"
      style={heroBg ? { background: heroBg } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      <div className="relative z-10 flex flex-col h-full min-h-[320px]">
        {/* Top bar */}
        <div className="flex items-start justify-between p-4 lg:p-5">
          <button
            type="button"
            onClick={onTogglePanel}
            className="inline-flex items-center gap-2 rounded-xl bg-black/40 backdrop-blur-md px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-black/50 transition-all active:scale-[0.97]"
          >
            {sidePanelOpen ? <X size={14} /> : <Menu size={14} />}
            <span className="font-normal truncate max-w-[120px]">{game.otixMediaTitle || game.title}</span>
          </button>

          {hasSuggestion && (
            <div className="flex items-center gap-1.5 rounded-xl bg-blue-500/20 backdrop-blur-md px-3 py-1.5">
              <span className="text-[11px] font-semibold text-blue-400">
                {game.otixConfidence != null ? `${Math.round(game.otixConfidence * 100)}%` : "?"} match
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex items-end p-5 lg:p-7">
          <div className="flex gap-4 lg:gap-5 items-end w-full">
            {/* Steam Grid image */}
            {gridImage && !imgFailed ? (
              <div className="hidden sm:block w-[88px] h-[132px] lg:w-[100px] lg:h-[150px] rounded-xl overflow-hidden flex-shrink-0 bg-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                {!imgLoaded && <div className="w-full h-full animate-pulse bg-white/10" />}
                <img
                  src={gridImage} alt=""
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgFailed(true)}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                />
              </div>
            ) : (
              <div className="hidden sm:block w-[88px] h-[132px] lg:w-[100px] lg:h-[150px] rounded-xl flex-shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-center opacity-20 bg-white/5">
                <Gamepad2 size={28} />
              </div>
            )}

            {/* Text */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header line */}
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/30 font-medium flex-wrap">
                <span>{game.platform === "steam" ? "Steam" : game.platform === "gog" ? "GOG" : game.platform === "epic" ? "Epic Games" : game.platform === "iso" ? "ISO Disc" : "PC"}</span>
                {detail?.releaseDate && <><span className="opacity-30">·</span><span>{detail.releaseDate.slice(0, 4)}</span></>}
                {detail?.releaseStatus && detail.releaseStatus !== "released" && (
                  <span className="text-blue-400 font-bold">{detail.releaseStatus}</span>
                )}
                {detail?.isFree && <span className="text-green-400 font-bold">Free</span>}
              </div>

              {/* Title */}
              <h2 className="text-xl lg:text-2xl font-extrabold text-white leading-tight tracking-tight">
                {game.otixMediaTitle || game.title}
              </h2>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-2">
                {detail?.avgRating != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/12 text-amber-400">
                    <Star size={11} className="fill-current" /> {(detail.avgRating * 10).toFixed(0)}
                    <span className="text-amber-400/40 font-normal">/100</span>
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-white/40 bg-white/5">
                  {installDir}
                </span>
                {detail?.isFree && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-500/12 text-green-400">Free</span>
                )}
              </div>

              {/* Genres */}
              {detail?.genres?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {detail.genres.slice(0, 5).map((g: any) => (
                    <span key={g.id} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/8 text-white/45 border border-white/5">{g.name}</span>
                  ))}
                </div>
              )}

              {/* Overview */}
              {detail?.overview && (
                <p className="text-xs text-white/50 leading-relaxed line-clamp-2 max-w-[500px]">{detail.overview}</p>
              )}

              {/* Suggestion callout */}
              {hasSuggestion && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/8 border border-blue-500/15">
                  <span className="text-xs text-blue-400 font-medium">
                    Match with <strong>{game.otixMatchSuggestion!.title}</strong>?
                  </span>
                  <div className="flex gap-1 ml-auto">
                    <button type="button" onClick={() => onAcceptSuggestion?.(game)}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-400 active:scale-[0.97]">
                      Yes
                    </button>
                    <button type="button" onClick={() => onRejectSuggestion?.(game)}
                      className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/15 active:scale-[0.97]">
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isMatched ? (
                  <>
                    <button type="button" onClick={() => onPlay(game)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-emerald-400 active:scale-[0.97] transition-all">
                      <Play size={14} fill="currentColor" /> Play Now
                    </button>
                    <button type="button" onClick={() => onOpenFolder(game)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/12 active:scale-[0.97] transition-all">
                      <Folder size={12} /> Open Folder
                    </button>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" /> installed
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-white/30 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/20" /> Not matched to catalog yet
                  </span>
                )}
              </div>

              {/* Google Drive Save Sync Card / Online Multiplayer Notice */}
              {isSolelyMultiplayer ? (
                <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/15 backdrop-blur-md space-y-1.5 max-w-[480px]">
                  <div className="flex items-center gap-2">
                    <Cloud size={16} className="text-blue-400" />
                    <span className="text-xs font-bold text-white">Save Sync Not Required</span>
                  </div>
                  <p className="text-xs text-white/50 leading-normal">
                    This is an online-only multiplayer service game. Progress and saves are managed directly by the server.
                  </p>
                </div>
              ) : (
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md space-y-3 max-w-[480px]">
                  <div className="flex items-center gap-2">
                    <Cloud size={16} className="text-[#4285F4]" />
                    <span className="text-xs font-bold text-white">Google Drive Save Sync</span>
                    {user?.googleId && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-md px-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                      </span>
                    )}
                  </div>

                  {!user?.googleId ? (
                    <div className="space-y-2">
                      <p className="text-xs text-white/50 leading-normal">
                        Link your Google account in settings to automatically backup and sync your game save files to Google Drive.
                      </p>
                      <Link
                        to="/settings"
                        search={{ section: "integrations" }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#4285F4] hover:bg-[#4285F4]/90 active:scale-[0.97] transition-all px-3 py-1.5 text-xs font-bold text-white"
                      >
                        <Link2 size={13} /> Connect Google Account
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2">
                        <span className="text-white/50">Google Account</span>
                        <span className="text-white/80 font-medium truncate max-w-[200px]" title={user.googleEmail || user.googleName || ""}>
                          {user.googleName || user.googleEmail}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-xs font-medium text-white/80">Auto Cloud Sync</span>
                          <p className="text-[10px] text-white/40 leading-none">Auto sync save data on game exit</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAutoSync(!(cloudSettings?.autoSync))}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none",
                            cloudSettings?.autoSync ? "bg-emerald-500" : "bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200",
                              cloudSettings?.autoSync ? "translate-x-4.5" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={syncing}
                          onClick={handleSyncNow}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/12 active:scale-[0.97] transition-all disabled:opacity-40"
                        >
                          <RefreshCw size={12} className={cn("text-white/60", syncing && "animate-spin")} />
                          {syncing ? "Syncing..." : "Sync Now"}
                        </button>
                        <div className="text-right">
                          {cloudSettings?.lastSyncAt ? (
                            <span className="text-[10px] text-white/40 block">
                              Last synced: {new Date(cloudSettings.lastSyncAt).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30 block">Never synced</span>
                          )}
                        </div>
                      </div>

                      {syncError && (
                        <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/15 rounded-lg p-2 flex items-start gap-1.5">
                          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                          <span>{syncError}</span>
                        </p>
                      )}

                      {successMsg && (
                        <p className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 rounded-lg p-2 flex items-start gap-1.5">
                          <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
                          <span>{successMsg}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Skeleton loading ──────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex gap-2.5 min-h-[280px]">
      <div className="w-[260px] rounded-2xl bg-[var(--dk-surface-glass)] animate-pulse hidden lg:block" />
      <div className="flex-1 rounded-2xl bg-[var(--dk-surface-glass)] animate-pulse" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export function GamesPage() {
  const {
    filteredLocalGames,
    selectedLocalGame,
    gameDetail,
    shelves,
    sidePanelOpen,
    activeTab,
    localSearchQuery,
    scanning,
    matchedCount,
    unmatchedCount,
    suggestionCount,
    selectGame,
    setSidePanelOpen,
    setActiveTab,
    setLocalSearchQuery,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleRescan,
    handlePlay,
    handleOpenFolder,
  } = useGames()

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
        }
      } catch (err) {
        console.error(`[AutoSync] Auto-sync failed for game: ${gameId}`, err)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const isLoading = false // games load synchronously from localStorage cache

  return (
    <div className="pb-16">
      <Helmet>
        <title>Games - Otix</title>
        <meta name="description" content="Launch and manage your game collection on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Gamepad2 className="h-6 w-6" />
              Games
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Launch and manage your game collection.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSidePanelOpen((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                sidePanelOpen
                  ? "bg-primary/15 text-primary"
                  : "bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]",
              )}
            >
              <Menu size={16} />
              Library
              {(matchedCount + suggestionCount) > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
            <button type="button" onClick={handleRescan} disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning..." : "Rescan"}
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="flex gap-2.5 items-stretch">
          {/* Side panel */}
          <div className="flex-shrink-0 hidden lg:block" style={{ maxHeight: "75vh" }}>
            <GamesSidePanel
              open={sidePanelOpen}
              onClose={() => setSidePanelOpen(false)}
              games={filteredLocalGames}
              selectedId={selectedLocalGame?.id ?? null}
              onSelect={selectGame}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={localSearchQuery}
              onSearchChange={setLocalSearchQuery}
              onRescan={handleRescan}
              scanning={scanning}
              totalCount={filteredLocalGames.length}
              matchedCount={matchedCount}
              unmatchedCount={unmatchedCount}
            />
          </div>

          {/* Hero */}
          <div className="flex-1 min-w-0">
            <HeroPanel
              game={selectedLocalGame}
              detail={gameDetail}
              onPlay={handlePlay}
              onOpenFolder={handleOpenFolder}
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onTogglePanel={() => setSidePanelOpen((prev) => !prev)}
              sidePanelOpen={sidePanelOpen}
            />
          </div>
        </div>
      )}

      {/* Shelves */}
      {shelves.length > 0 && (
        <div className="mt-6">
          <GamesShelf
            rows={shelves}
            onSelectGame={selectGame}
            onAcceptSuggestion={handleAcceptSuggestion}
            onRejectSuggestion={handleRejectSuggestion}
          />
        </div>
      )}

      {/* Footer stats */}
      <div className="flex gap-4 pt-3 mt-6 border-t border-white/5 text-xs text-muted-foreground/50">
        <span>{matchedCount} matched</span>
        <span>{unmatchedCount} unmatched</span>
        <span>{suggestionCount} suggestions</span>
      </div>
    </div>
  )
}
