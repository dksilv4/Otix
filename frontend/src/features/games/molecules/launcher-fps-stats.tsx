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
  const frameCount = isLive ? liveFps.frameCount : null

  return (
    <div className="relative bg-white/[0.06] rounded-xl px-5 py-3 min-w-[160px] overflow-hidden">
      {/* Sparkline */}
      {sparkline && (
        <svg
          width={sparkline.w}
          height={sparkline.h}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="fps-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${sparkline.d}L${sparkline.w},${sparkline.h}L0,${sparkline.h}Z`} fill="url(#fps-grad)" />
          <path d={sparkline.d} fill="none" stroke="rgb(52 211 153)" strokeWidth="1" opacity="0.4" />
        </svg>
      )}

      <div className="relative flex items-center gap-3" style={{ zIndex: 1 }}>
        {/* Live dot */}
        {isLive && (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        )}

        <div className="flex flex-col">
          <div className="flex items-baseline gap-1.5">
            {fpsValue !== null ? (
              <>
                <span className="text-xl font-black text-white tracking-tight leading-none">
                  {fpsValue}
                </span>
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest leading-none">
                  FPS
                </span>
              </>
            ) : (
              <span className="text-xl font-black text-white/40 tracking-tight leading-none">&mdash;</span>
            )}
          </div>
          {frameCount !== null && (
            <span className="text-[10px] font-medium text-white/40 tracking-wide mt-0.5">
              {frameCount} frames
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
