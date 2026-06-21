import { X, Gamepad2, ExternalLink } from 'lucide-react'

interface ScannedGameModalProps {
  game: any
  onClose: () => void
}

export function ScannedGameModal({ game, onClose }: ScannedGameModalProps) {
  const posterUrl = game.otixPosterUrl || game.posterUrl
  const isMatched = !!game.otixMediaId
  const confidence = game.otixConfidence

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-zinc-900 border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white truncate mr-4">{game.title}</h2>
          <button onClick={onClose} className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 divide-x divide-white/5">
          {/* Left: Original (Epic) Data */}
          <div className="p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Original Data</h3>
            {/* Poster */}
            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
              {game.posterUrl ? (
                <img src={game.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <Gamepad2 className="h-10 w-10 text-white/20" />
                </div>
              )}
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="text-white font-medium">{game.title}</p>
              <p className="text-white/40 text-xs">{game.platform}</p>
              {game.description && (
                <p className="text-white/50 text-xs line-clamp-3">{game.description}</p>
              )}
              {game.installPath && (
                <p className="text-white/30 text-[10px] font-mono truncate" title={game.installPath}>
                  {game.installPath}
                </p>
              )}
            </div>
          </div>

          {/* Right: Matched Otix Data */}
          <div className="p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Matched Otix</h3>
            {isMatched ? (
              <>
                {/* Poster */}
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                  {game.otixPosterUrl ? (
                    <img src={game.otixPosterUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <Gamepad2 className="h-10 w-10 text-white/20" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="text-green-400 font-medium">{game.otixMediaTitle || game.otixMediaSlug}</p>
                  {confidence != null && (
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                      confidence >= 0.95 ? 'bg-green-500/20 text-green-400' :
                      confidence >= 0.85 ? 'bg-blue-500/20 text-blue-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {(confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                  {game.otixMediaSlug && (
                    <p className="text-white/40 text-xs">slug: {game.otixMediaSlug}</p>
                  )}
                  <a
                    href={`/media/game/${game.otixMediaId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mt-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" /> View in Otix
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                <Gamepad2 className="h-8 w-8 text-white/20 mb-2" />
                <p className="text-sm text-white/40">Not matched yet</p>
                <p className="text-xs text-white/30 mt-1">Scan again to match this game</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
