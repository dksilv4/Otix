import { useState, useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { Play, Cloud, RefreshCw, AlertCircle, FileCode, Clock, Gauge } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-provider'
import { cn, osName } from '@/lib/utils'
import { useLocalGame } from '@/features/game-scanner/game-queries'
import { useSaveLocations } from '@/features/games/games-queries'
import { useGamePlaytime } from '@/features/games/hooks/use-launcher-playtime'
import { useCloudSync } from '@/features/games/hooks/use-launcher-cloud-sync'
import { useLiveFps } from '@/features/games/hooks/use-live-fps'
import type { FpsStatsData } from '@/lib/desktop-api'

function formatPlaytime(playtime: { totalMinutes: number } | null, steamPlaytime: number | null | undefined): string {
  if (steamPlaytime != null) {
    const hours = Math.round(steamPlaytime / 60)
    const mins = steamPlaytime % 60
    return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
  }
  if (playtime && playtime.totalMinutes > 0) {
    const hours = Math.floor(playtime.totalMinutes / 60)
    const mins = playtime.totalMinutes % 60
    return hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`
  }
  return '—'
}

function formatFpsLabel(
  liveFps: { currentFps: number; frameCount: number } | null | undefined,
  lastFps: FpsStatsData | null | undefined,
): { value: string; detail: string; live: boolean } {
  // Live FPS takes priority when game is running
  if (liveFps && liveFps.frameCount > 0) {
    return {
      value: `${Math.round(liveFps.currentFps)}`,
      detail: `${liveFps.frameCount} frames captured`,
      live: true,
    }
  }
  if (lastFps && lastFps.totalFrames > 0) {
    return {
      value: `${Math.round(lastFps.avgFps)}`,
      detail: `1%: ${Math.round(lastFps.onePercentLow)} · ${lastFps.totalFrames} frames`,
      live: false,
    }
  }
  return { value: '—', detail: 'No FPS data', live: false }
}

export function LauncherGameStats() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { user } = useAuth()
  const [showJson, setShowJson] = useState(false)
  const { data: g } = useLocalGame(gameId)
  const mediaId = g?.data?.id
  const playtime = useGamePlaytime(g?.id)
  const { snapshot: liveFps, history: fpsHistory } = useLiveFps(g?.id)

  // SVG sparkline path
  const sparkline = useMemo(() => {
    if (fpsHistory.length < 2) return null
    const w = 200, h = 60
    const max = Math.max(...fpsHistory, 1)
    const pts = fpsHistory.map((v, i) => `${i * (w / (fpsHistory.length - 1))},${h - (v / max) * h}`).join(' ')
    return { d: `M${pts}`, w, h }
  }, [fpsHistory])

  // ── Cloud sync ──
  const { data: serverLocations, refetch: refetchServerLocations } = useSaveLocations(mediaId)
  const sync = useCloudSync({ gameId, gameTitle: g?.data?.title || g?.title || '', serverLocations, refetchServerLocations })

  if (!g) return null

  const avgRating = (g.data?.avgRating as number | undefined) ?? null
  const ratingCount = (g.data?.ratingCount as number) ?? 0

  const cloudIcon = sync.syncing ? <RefreshCw size={11} className="animate-spin text-blue-400" />
    : sync.syncError ? <AlertCircle size={11} className="text-red-400" />
    : sync.cloudSettings?.isPathConfirmed ? <Cloud size={11} className="text-emerald-400" />
    : <Cloud size={11} className="text-white/30" />
  const cloudTitle = sync.syncing ? 'Syncing...'
    : sync.syncError ? 'Sync error'
    : sync.cloudSettings?.lastSyncAt ? `Synced ${new Date(sync.cloudSettings.lastSyncAt).toLocaleTimeString()}`
    : 'Cloud saves'

  const playtimeStr = formatPlaytime(playtime, null)
  const fps = formatFpsLabel(liveFps, playtime?.lastFpsStats)

  return (
    <div className="z-1 absolute bottom-8 pointer-events-auto" style={{ left: 'calc(76px + 1.5rem)' }}>
      <div className="bg-white/10 backdrop-blur-2xl rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6">
        {/* Playtime */}
        <div className="flex items-center gap-3 min-w-0">
          <Clock size={18} className="text-white/80 shrink-0" />
          <div>
            <p className="text-lg font-black text-white tracking-tight leading-none">{playtimeStr}</p>
            <p className="text-[10px] font-semibold text-white/60 tracking-wide">Played</p>
          </div>
        </div>

        <div className="w-px h-10 bg-white/15" />

        {/* FPS / Performance */}
        <div className="flex items-center gap-3 min-w-0 relative overflow-hidden" style={{ minWidth: 160 }}>
          {/* Sparkline background */}
          {sparkline && (
            <svg width={sparkline.w} height={sparkline.h} className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="fps-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${sparkline.d}L${sparkline.w},${sparkline.h}L0,${sparkline.h}Z`} fill="url(#fps-grad)" />
              <path d={sparkline.d} fill="none" stroke="rgb(52 211 153)" strokeWidth="1.5" opacity="0.5" />
            </svg>
          )}
          <div className="relative shrink-0" style={{ zIndex: 1 }}>
            <Gauge size={18} className={cn("shrink-0", fps.live ? "text-emerald-400" : "text-white/80")} />
            {fps.live && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
          <div>
            <p className={cn("text-lg font-black tracking-tight leading-none", fps.live ? "text-emerald-400" : "text-white/80")}>{fps.value}</p>
            <p className="text-[10px] font-semibold text-white/60 tracking-wide">
              {fps.live ? <span className="text-emerald-400/80">LIVE · </span> : null}{fps.detail}
            </p>
          </div>
        </div>

        {/* Otix rating */}
        {avgRating && avgRating > 0 ? (
          <>
            <div className="w-px h-10 bg-white/15" />
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-amber-400 text-lg leading-none">★</span>
              <div>
                <p className="text-lg font-black text-amber-400 tracking-tight leading-none">{(avgRating / 10).toFixed(1)}</p>
                <p className="text-[10px] font-semibold text-white/60 tracking-wide">{ratingCount > 0 ? `${ratingCount} ratings` : '—'}</p>
              </div>
            </div>
          </>
        ) : null}

        <div className="w-px h-10 bg-white/15" />

        {/* Cloud sync */}
        <button
          onClick={sync.handleSyncNow}
          disabled={sync.syncing || !sync.cloudSettings?.isPathConfirmed}
          className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40 active:scale-95"
          title={cloudTitle}
        >
          {cloudIcon}
        </button>

        {/* Admin debug */}
        {user?.isAdmin && (
          <button
            onClick={() => setShowJson(!showJson)}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-amber-500/20 transition-all cursor-pointer active:scale-95"
            title="View game data JSON"
          >
            <FileCode size={13} className="text-amber-400/80" />
          </button>
        )}
      </div>

      {/* JSON modal */}
      {showJson && user?.isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowJson(false)}>
          <div className="max-w-2xl w-full max-h-[80vh] overflow-auto m-4 p-4 rounded-2xl bg-[#0a0a0d] border border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-black tracking-wider uppercase text-white/60">Game Data JSON</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify(g.data || g, null, 2))} className="text-[10px] text-white/30 hover:text-white/70 transition-colors">Copy</button>
                <button onClick={() => setShowJson(false)} className="text-white/30 hover:text-white/70 text-sm">&times;</button>
              </div>
            </div>
            <pre className="text-[10px] text-white/70 leading-relaxed font-mono whitespace-pre-wrap break-all select-text cursor-text">{JSON.stringify(g.data || g, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
