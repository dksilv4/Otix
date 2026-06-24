import { Gamepad2 } from 'lucide-react'

export function GameMatchingSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">Game Matching</h2>
        <p className="text-sm mt-1 text-white/60">
          Review and manage game-to-catalog matches.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Gamepad2 className="h-12 w-12 text-white/10 mb-4" />
        <p className="text-sm text-white/40 font-medium">No scanner plugins enabled</p>
        <p className="text-xs text-white/30 mt-1.5 max-w-sm">
          Enable a scanner plugin from the Plugins page to browse and manage game matching.
        </p>
      </div>
    </div>
  )
}
