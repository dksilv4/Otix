import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLiveFps } from '@/features/games/hooks/use-live-fps'
import { useGamePlaytime } from '@/features/games/hooks/use-launcher-playtime'

export function LauncherFpsStats() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { snapshot: liveFps, history: fpsHistory } = useLiveFps(gameId)
  const playtime = useGamePlaytime(gameId)

  const sparkline = useMemo(() => {
    if (fpsHistory.length < 2) return null
    const w = 160; const h = 36
    const max = Math.max(...fpsHistory, 1)
    const pts = fpsHistory.map((v, i) =>
      `${i * (w / (fpsHistory.length - 1))},${h - (v / max) * h}`
    ).join(' ')
    return { d: `M${pts}`, w, h }
  }, [fpsHistory])

  const isLive = liveFps && liveFps.frameCount > 0
  const lastStats = playtime?.lastFpsStats

  // Live FPS while game is running, average from last session when closed
  let displayValue: { value: string; label: string; live: boolean } | null = null

  if (isLive && (!lastStats || lastStats.totalFrames === 0)) {
    // Game running and no previous data — show live
    displayValue = {
      value: `${Math.round(liveFps.currentFps)}`,
      label: 'FPS',
      live: true,
    }
  } else if (lastStats && lastStats.totalFrames > 0) {
    // Prefer last session average over stale live data
    displayValue = {
      value: `${Math.round(lastStats.avgFps)}`,
      label: isLive ? 'AVG' : 'AVG FPS',
      live: false,
    }
  } else if (isLive) {
    displayValue = {
      value: `${Math.round(liveFps.currentFps)}`,
      label: 'FPS',
      live: true,
    }
  }

  return (
    <div className="relative bg-white/5 backdrop-blur-2xl rounded-xl px-5 py-5.25 max-h-[65px] min-w-[180px] overflow-hidden">
      {/* Full-bleed sparkline — only while capturing live data */}
      {displayValue?.live && sparkline && (
        <svg
          viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
          className="absolute inset-0 pointer-events-none w-full h-full"
          preserveAspectRatio="none"
          style={{ zIndex: 0 }}
        >
          <defs>
            <linearGradient id="fps-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d={`${sparkline.d}L${sparkline.w},${sparkline.h}L0,${sparkline.h}Z`} fill="url(#fps-grad)" />
          <path d={sparkline.d} fill="none" stroke="rgb(52 211 153)" strokeWidth="0.5" opacity="1" />
        </svg>
      )}

      {/* Content overlay */}
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="flex items-center gap-2">
          {displayValue?.live && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          )}
          {displayValue ? (
            <>
              <span
                className="text-2xl font-bold tracking-tight leading-none"
                style={{
                  color: displayValue.live
                    ? 'rgb(255 255 255 / 0.9)'
                    : 'rgb(255 255 255 / 0.4)',
                }}
              >
                {displayValue.value}
              </span>
              <span className="text-[11px] font-medium text-white/25 uppercase tracking-widest leading-none">
                {displayValue.label}
              </span>
            </>
          ) : (
            <span className="text-2xl font-bold text-white/15 tracking-tight leading-none">
              &mdash;
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
