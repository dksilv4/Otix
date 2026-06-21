import { useEffect, useState, useCallback } from 'react'
import { Loader2, Gamepad2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { DkImage } from '@dk-ui/atoms/image'
import { ProviderLogo } from '../components/atoms/provider-logo'
import { ScannedGameModal } from '../components/organisms/settings-scanned-game-modal'

export function SettingsScannedGamesPage() {
  const params = new URLSearchParams(window.location.search)
  const source = params.get('source') || ''
  const [games, setGames] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<any | null>(null)
  const api = window.desktopAPI

  const fetchGames = useCallback(() => {
    if (!api?.getScannedGamesFiltered) return
    setLoading(true)
    const filter = source ? { platform: [source] } : {}
    api.getScannedGamesFiltered(filter).then((data: any[]) => {
      setGames(data || [])
    }).finally(() => setLoading(false))
  }, [source, api])

  useEffect(() => { fetchGames() }, [fetchGames])

  // Re-fetch when games DB changes (new match data arrives)
  useEffect(() => {
    if (!api?.onGamesUpdated) return
    const unsub = api.onGamesUpdated(() => fetchGames())
    return () => unsub?.()
  }, [api, fetchGames])

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {games.map((game: any) => {
            const posterUrl = game.otixPosterUrl || game.posterUrl
            const isMatched = !!game.otixMediaId
            const confidence = game.otixConfidence
            return (
              <div key={game.id} onClick={() => setSelectedGame(game)} className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer">
                {/* Poster */}
                {posterUrl ? (
                  <DkImage
                    src={posterUrl}
                    alt={game.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
                    <Gamepad2 className="h-12 w-12 text-white/10" />
                  </div>
                )}
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Platform logo top-left */}
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <ProviderLogo platform={game.platform} className="h-3.5" />
                  </div>
                </div>

                {/* Match status badge top-right */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                  {isMatched && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 backdrop-blur-sm flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Matched
                    </span>
                  )}
                  {confidence != null && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm ${
                      confidence >= 0.95 ? 'bg-green-500/20 text-green-400' :
                      confidence >= 0.85 ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Title + matched media at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
                  <p className="text-sm font-semibold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {game.title}
                  </p>
                  {game.otixMediaTitle && game.otixMediaTitle !== game.title && (
                    <p className="text-[11px] text-green-400/70 truncate mt-0.5">
                      {game.otixMediaTitle}
                    </p>
                  )}
                  {!isMatched && (
                    <p className="text-[11px] text-yellow-400/50 mt-0.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Unmatched
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {selectedGame && (
        <ScannedGameModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      )}
    </div>
  )
}
