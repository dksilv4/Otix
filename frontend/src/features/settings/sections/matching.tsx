import { useState } from 'react'
import { Shuffle, Gamepad2 } from 'lucide-react'
import { GameMatchingSection } from './game-matching'
import { EpicLibrarySection } from './epic-library'

type Tab = 'all' | 'epic'

export function MatchingSection() {
  const [tab, setTab] = useState<Tab>('all')

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'all', label: 'All Games', desc: 'Match scanned games to the Otix catalog' },
    { id: 'epic', label: 'Epic Library', desc: 'View and adjust Epic Games matches' },
  ]

  return (
    <div className="space-y-6 min-h-full">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
          <Shuffle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Game Matching</h2>
          <p className="text-sm text-white/50 mt-0.5">
            {tab === 'all' ? 'Match scanned games to the Otix catalog' : 'Epic Games library matches'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-white/5 pb-3">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 h-9 rounded-lg px-4 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            {t.id === 'epic' && <Gamepad2 className="h-3.5 w-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' ? <GameMatchingSection /> : <EpicLibrarySection />}
    </div>
  )
}
