import { Shuffle } from 'lucide-react'

export function MatchingSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">Game Matching</h2>
        <p className="text-sm mt-1 text-white/60">
          Match scanned games to the Otix catalog.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Shuffle className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/40 font-medium">No scanner plugins enabled</p>
        <p className="text-xs text-white/30 mt-1.5 max-w-sm">
          Enable a scanner plugin from the Plugins page to scan and match your game library.
        </p>
      </div>
    </div>
  )
}
