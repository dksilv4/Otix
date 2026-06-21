import { Shuffle } from 'lucide-react'
import { GameMatchingSection } from './game-matching'
import { PluginSlot } from '../components/PluginSlot'
import { getPluginAPI } from '../components/PluginSettings'

export function MatchingSection() {
  return (
    <div className="space-y-6 min-h-full">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
          <Shuffle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Game Matching</h2>
          <p className="text-sm text-white/50 mt-0.5">
            Match scanned games to the Otix catalog
          </p>
        </div>
      </div>

      <PluginSlot location="matching:scan" pluginApi={getPluginAPI()!} />

      <GameMatchingSection />
    </div>
  )
}
