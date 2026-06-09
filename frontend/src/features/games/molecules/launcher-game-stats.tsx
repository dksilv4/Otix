import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { FileCode } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-provider'
import { useLocalGame } from '@/features/game-scanner/game-queries'
import { LauncherPlaytimeStats } from '@/features/games/atoms/launcher-playtime-stats'
import { LauncherRatingStats } from '@/features/games/atoms/launcher-rating-stats'
import { LauncherCloudSyncStat } from '@/features/games/atoms/launcher-cloud-sync-stat'
import { LauncherFpsStats } from '@/features/games/molecules/launcher-fps-stats'

export function LauncherGameStats() {
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { user } = useAuth()
  const [showJson, setShowJson] = useState(false)
  const { data: g } = useLocalGame(gameId)

  if (!g) return null

  return (
    <div className="flex items-center gap-4">
      <div className="bg-white/10 backdrop-blur-2xl rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6">
        <LauncherPlaytimeStats gameId={g.id} />
        <LauncherRatingStats gameId={g.id} />

        <div className="w-px h-10 bg-white/15" />

        <LauncherCloudSyncStat gameId={g.id} />

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

      <LauncherFpsStats />

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
