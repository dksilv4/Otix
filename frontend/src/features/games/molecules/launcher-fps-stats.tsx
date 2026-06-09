import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useLiveFps } from '@/features/games/hooks/use-live-fps'

export function LauncherFpsStats() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { snapshot: liveFps, history: fpsHistory } = useLiveFps(gameId)

  const sparkline = useMemo(() => {
    if (fpsHistory.length < 2) return null
    const w = 160; const h = 36
    const max = Math.max(...fpsHistory, 1)
    const pts = fpsHistory.map((v, i) =>
      `${i * (w / (fpsHistory.length - 1))},${h - (v / max) * h}`
    ).join(' ')
    return { d: `M${pts}`, w, h }
  }, [fpsHistory])

  if (!liveFps && fpsHistory.length === 0) return null

  const isLive = liveFps && liveFps.frameCount > 0
  const fpsValue = isLive ? Math.round(liveFps.currentFps) : null

  return (
    <div className="relative backdrop-blur-2xl rounded-xl px-5 py-3 min-w-[180px] overflow-hidden">
      {/* Full-bleed sparkline */}
      {sparkline && (
        <svg
          viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
          className="absolute inset-0 pointer-events-none w-full h-full"
          preserveAspectRatio="none"
          style={{ zIndex: 0 }}
        >
          <defs>
            <linearGradient id="fps-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${sparkline.d}L${sparkline.w},${sparkline.h}L0,${sparkline.h}Z`} fill="url(#fps-grad)" />
          <path d={sparkline.d} fill="none" stroke="rgb(52 211 153)" strokeWidth="2" opacity="0.5" />
        </svg>
      )}

      {/* Content overlay */}
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          )}
          {fpsValue !== null ? (
            <>
              <span className="text-2xl font-bold text-white/90 tracking-tight leading-none">
                {fpsValue}
              </span>
              <span className="text-[11px] font-medium text-white/25 uppercase tracking-widest leading-none">
                FPS
              </span>
            </>
          ) : (
            <span className="text-2xl font-bold text-white/20 tracking-tight leading-none">&mdash;</span>
          )}
        </div>
      </div>
    </div>
  )
}
