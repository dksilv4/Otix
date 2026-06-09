import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLiveFps } from '@/features/games/hooks/use-live-fps'

interface LauncherFpsStatsProps {
  className?: string
}

export function LauncherFpsStats({ className }: LauncherFpsStatsProps) {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { snapshot: liveFps, history: fpsHistory } = useLiveFps(gameId)

  const sparkline = useMemo(() => {
    if (fpsHistory.length < 2) return null
    const w = 200, h = 60
    const max = Math.max(...fpsHistory, 1)
    const pts = fpsHistory.map((v, i) => `${i * (w / (fpsHistory.length - 1))},${h - (v / max) * h}`).join(' ')
    return { d: `M${pts}`, w, h }
  }, [fpsHistory])

  if (!liveFps && fpsHistory.length === 0) return null

  const fps = liveFps && liveFps.frameCount > 0
    ? { value: `${Math.round(liveFps.currentFps)}`, detail: `${liveFps.frameCount} frames`, live: true }
    : { value: '—', detail: 'No FPS data', live: false }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-2xl px-5 py-4 shadow-2xl", className)} style={{ minWidth: 180 }}>
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

      <div className="flex items-center gap-3 relative" style={{ zIndex: 1 }}>
        <div className="relative shrink-0">
          <Gauge size={20} className={cn("shrink-0", fps.live ? "text-emerald-400" : "text-white/50")} />
          {fps.live && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <p className={cn("text-2xl font-black tracking-tight leading-none", fps.live ? "text-emerald-400" : "text-white/80")}>
              {fps.value}
            </p>
            {fps.live && (
              <span className="text-[11px] font-semibold text-emerald-400/60 uppercase tracking-widest">FPS</span>
            )}
          </div>
          <p className="text-[10px] font-semibold text-white/50 tracking-wide mt-0.5">
            {fps.live && <span className="text-emerald-400/70">LIVE · </span>}{fps.detail}
          </p>
        </div>
      </div>
    </div>
  )
}
