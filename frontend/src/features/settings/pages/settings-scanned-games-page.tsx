import { useEffect, useState } from 'react'
import { Loader2, Gamepad2, ArrowLeft } from 'lucide-react'

export function SettingsScannedGamesPage() {
  const params = new URLSearchParams(window.location.search)
  const source = params.get('source') || ''
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const api = window.desktopAPI

  useEffect(() => {
    if (!api?.getScannedGamesFiltered) return
    setLoading(true)
    const filter = source ? { platform: [source] } : {}
    api.getScannedGamesFiltered(filter).then((data: any[]) => {
      setGames(data || [])
    }).finally(() => setLoading(false))
  }, [source, api])

  const title = source ? `${source.toUpperCase()} Games` : 'All Scanned Games'

  return (
    <div className="p-6 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/settings/matching"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </a>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="text-sm text-white/40">({games.length})</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Gamepad2 className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">No scanned games found. Scan a game library first.</p>
        </div>
      )}

      {!loading && games.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {games.map((game: any) => (
            <div key={game.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(game.otixPosterUrl || game.posterUrl) ? (
                <img src={game.otixPosterUrl || game.posterUrl} alt="" className="w-12 h-16 rounded object-cover shrink-0" />
              ) : (
                <div className="w-12 h-16 rounded bg-white/10 flex items-center justify-center shrink-0">
                  <Gamepad2 className="h-6 w-6 text-white/20" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{game.title}</p>
                <p className="text-xs text-white/40">{game.platform}</p>
                {game.otixMediaTitle && (
                  <p className="text-xs text-green-400/60 truncate mt-0.5">→ {game.otixMediaTitle}</p>
                )}
              </div>
              {game.otixConfidence != null && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                  game.otixConfidence >= 0.95 ? 'bg-green-500/20 text-green-400' :
                  game.otixConfidence >= 0.85 ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {(game.otixConfidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
