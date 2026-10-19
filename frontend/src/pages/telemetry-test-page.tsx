import { useState } from 'react'
import type { UniversalGameTelemetry } from '@/features/activity/types/telemetry-types'
import { ActivityModuleLiveTelemetry } from '@/features/activity/components/molecules/activity-module-live-telemetry'
import { ActivityModuleSection } from '@/features/activity/components/molecules/activity-module-section'
import { TELEMETRY_DESIGNS } from '@/features/activity/components/molecules/telemetry-designs'
import { Gamepad2, LayoutGrid, Eye, Users, Trophy, Sparkles } from 'lucide-react'

const MOCK_GAMES: Record<string, UniversalGameTelemetry> = {
  cs2ScreenshotReplica: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'match',
    playerName: 'DK',
    mapOrZone: 'Inferno',
    roundOrLap: 12,
    mode: 'Competitive',
    phase: 'Live',
    scores: {
      teamA: { label: 'CT', score: 9 },
      teamB: { label: 'T', score: 7 },
    },
    vitals: {
      health: 100,
      armor: 100,
      hasSecondaryArmor: true,
    },
    stats: [
      { label: 'Kills', value: 21, iconType: 'crosshair' },
      { label: 'Deaths', value: 11, iconType: 'deaths' },
      { label: 'Assists', value: 5, iconType: 'assists' },
      { label: 'MVPs', value: 4, iconType: 'trophy' },
    ],
    summaryKda: '21K / 11D',
    statusSide: 'Playing as CT',
    money: 250,
    loadout: {
      primary: 'MAG-7',
      secondary: 'USP-S',
      knife: 'Knife',
      hasDefuser: true,
    },
    alert: {
      type: 'danger',
      text: 'Bomb Planted',
    },
    timestamp: Date.now(),
  },
  cs2Match: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'match',
    playerName: 'DK',
    mapOrZone: 'Dust II',
    roundOrLap: 16,
    mode: 'Competitive',
    phase: 'Live',
    scores: {
      teamA: { label: 'CT', score: 9 },
      teamB: { label: 'T', score: 7 },
    },
    vitals: {
      health: 84,
      armor: 100,
      hasSecondaryArmor: true,
    },
    stats: [
      { label: 'Kills', value: 21, iconType: 'crosshair' },
      { label: 'Deaths', value: 11, iconType: 'deaths' },
      { label: 'Assists', value: 5, iconType: 'assists' },
      { label: 'MVPs', value: 4, iconType: 'trophy' },
    ],
    summaryKda: '21K / 11D',
    statusSide: 'Playing as CT',
    money: 4850,
    loadout: {
      primary: 'M4A1-S',
      secondary: 'USP-S',
      knife: 'Knife',
      hasDefuser: true,
    },
    alert: {
      type: 'danger',
      text: 'Bomb Planted',
    },
    timestamp: Date.now(),
  },
  cs2Defeat: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'match',
    playerName: 'DK',
    mapOrZone: 'Inferno',
    roundOrLap: 24,
    mode: 'Competitive',
    phase: 'Match Lost',
    scores: {
      teamA: { label: 'CT', score: 9 },
      teamB: { label: 'T', score: 13 },
    },
    vitals: {
      health: 0,
      armor: 0,
      hasSecondaryArmor: false,
    },
    stats: [
      { label: 'Kills', value: 12, iconType: 'crosshair' },
      { label: 'Deaths', value: 16, iconType: 'deaths' },
      { label: 'Assists', value: 3, iconType: 'assists' },
      { label: 'MVPs', value: 1, iconType: 'trophy' },
    ],
    summaryKda: '12K / 16D',
    statusSide: 'Playing as CT',
    money: 1400,
    loadout: {
      secondary: 'USP-S',
      hasDefuser: false,
    },
    matchResult: {
      isCompleted: true,
      isWin: false,
      kills: 12,
      deaths: 16,
      assists: 3,
      kdr: 0.75,
    },
    timestamp: Date.now(),
  },
  cs2Spectating: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'match',
    playerName: 'DK',
    mapOrZone: 'Nuke',
    roundOrLap: 14,
    mode: 'Competitive',
    phase: 'Round Live',
    scores: {
      teamA: { label: 'CT', score: 7 },
      teamB: { label: 'T', score: 6 },
    },
    // Vitals strictly omitted while spectating
    vitals: undefined,
    stats: [
      { label: 'Kills', value: 14, iconType: 'crosshair' },
      { label: 'Deaths', value: 8, iconType: 'deaths' },
      { label: 'Assists', value: 4, iconType: 'assists' },
      { label: 'MVPs', value: 2, iconType: 'trophy' },
    ],
    summaryKda: '14K / 8D',
    statusSide: 'Playing as CT',
    isSpectating: true,
    money: 2100,
    loadout: {
      primary: 'FAMAS',
      secondary: 'USP-S',
      hasDefuser: true,
    },
    timestamp: Date.now(),
  },
  cs2Victory: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'match',
    playerName: 'DK',
    mapOrZone: 'Mirage',
    roundOrLap: 22,
    mode: 'Premier',
    phase: 'Match Won',
    scores: {
      teamA: { label: 'CT', score: 13 },
      teamB: { label: 'T', score: 8 },
    },
    vitals: {
      health: 100,
      armor: 100,
      hasSecondaryArmor: true,
    },
    stats: [
      { label: 'Kills', value: 24, iconType: 'crosshair' },
      { label: 'Deaths', value: 10, iconType: 'deaths' },
      { label: 'Assists', value: 6, iconType: 'assists' },
      { label: 'MVPs', value: 5, iconType: 'trophy' },
    ],
    summaryKda: '24K / 10D',
    statusSide: 'Playing as CT',
    money: 16000,
    loadout: {
      primary: 'AWP',
      secondary: 'Desert Eagle',
      hasDefuser: true,
    },
    matchResult: {
      isCompleted: true,
      isWin: true,
      kills: 24,
      deaths: 10,
      assists: 6,
      kdr: 2.4,
    },
    timestamp: Date.now(),
  },
  cs2Lobby: {
    id: 'cs2',
    gameTitle: 'Counter-Strike 2',
    activity: 'lobby',
    playerName: 'DK',
    mode: 'Competitive',
    timestamp: Date.now(),
  },
}

/**
 * Dev test page to showcase and compare 6 new Counter-Strike 2 telemetry designs.
 * Built from scratch incorporating specific user feedback:
 * - Minimal, compact feel (Design 8)
 * - Clear stats visibility (Design 6) without individual isolated boxes
 * - Team score containers with official Steam background colors (bg-cs2-ct / bg-cs2-t)
 * - Displaying player money and weapon loadout
 */
export const TelemetryTestPage = () => {
  const [selectedKey, setSelectedKey] = useState<string>('cs2ScreenshotReplica')
  const [viewMode, setViewMode] = useState<'gallery' | 'focus'>('gallery')
  const [activeDesignId, setActiveDesignId] = useState<string>('cs2-steam-tactical-dock')

  const currentTelemetry = MOCK_GAMES[selectedKey] || MOCK_GAMES.cs2Match

  return (
    <div className="min-h-screen w-full bg-[var(--background)] px-4 py-8 md:px-8 max-w-6xl mx-auto flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Counter-Strike 2 Telemetry Studio
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            6 new designs built from scratch: minimal footprint, Steam team background colors, visible non-boxy stats ribbon, money counter, and active weapon loadout.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl shadow-xs self-start md:self-auto">
          <button
            onClick={() => setViewMode('gallery')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              viewMode === 'gallery'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>All 6 Designs</span>
          </button>
          <button
            onClick={() => setViewMode('focus')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              viewMode === 'focus'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Focused Inspector</span>
          </button>
        </div>
      </div>

      {/* Simulated Game State Picker */}
      <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
            Simulate Match State
          </span>
          <span className="text-[11px] text-muted-foreground">
            Applies across all 6 designs in real-time
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => setSelectedKey('cs2Match')}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              selectedKey === 'cs2Match'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground'
            }`}
          >
            Alive in Match ($4,850 · M4A1-S · Bomb Planted)
          </button>

          <button
            onClick={() => setSelectedKey('cs2Defeat')}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              selectedKey === 'cs2Defeat'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground'
            }`}
          >
            Eliminated ($1,400 · Dead Placeholder)
          </button>

          <button
            onClick={() => setSelectedKey('cs2Spectating')}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              selectedKey === 'cs2Spectating'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground'
            }`}
          >
            Spectating (Dead Placeholder · Own Stats Protected)
          </button>

          <button
            onClick={() => setSelectedKey('cs2Victory')}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              selectedKey === 'cs2Victory'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground'
            }`}
          >
            Victory ($16,000 Max Bank · AWP · 2.4x KDR)
          </button>

          <button
            onClick={() => setSelectedKey('cs2Lobby')}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${
              selectedKey === 'cs2Lobby'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:text-foreground'
            }`}
          >
            In Lobby (Waiting for Match)
          </button>
        </div>
      </div>

      {/* Gamification XP Calculator Simulation Card */}
      {currentTelemetry.matchResult && (
        <div className="rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-bold text-foreground">
              Otix Gamification Engine: Match XP Breakdown
            </span>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>Base Time: <strong className="text-foreground">20 XP</strong></span>
              <span>·</span>
              <span>Completion: <strong className="text-foreground">+50 XP</strong></span>
              <span>·</span>
              <span>Win Bonus: <strong className="text-foreground">{currentTelemetry.matchResult.isWin ? '+50 XP' : '+0 XP'}</strong></span>
              <span>·</span>
              <span>KDR Multiplier: <strong className="text-primary">{Math.max(1.0, currentTelemetry.matchResult.kdr ?? 1.0).toFixed(1)}x</strong></span>
            </div>
          </div>

          <button
            onClick={() => {
              const res = currentTelemetry.matchResult!
              const base = 20
              const completion = 50
              const win = res.isWin ? 50 : 0
              const mult = Math.max(1.0, Math.min(4.0, res.kdr ?? 1.0))
              const totalAwarded = Math.round((base + completion + win) * mult)
              const subtitle = [
                currentTelemetry.gameTitle,
                res.isWin ? 'Victory' : 'Match Completed',
                mult > 1.0 ? `${mult.toFixed(1)}x KDR` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')
              import('@/components/ui/atoms/xp-toast').then(({ showXPToast }) => {
                showXPToast(totalAwarded, subtitle)
              })
            }}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs tracking-tight shadow-sm hover:opacity-90 active:scale-95 transition-all shrink-0"
          >
            Simulate Awarding +{Math.round((20 + 50 + (currentTelemetry.matchResult.isWin ? 50 : 0)) * Math.max(1.0, Math.min(4.0, currentTelemetry.matchResult.kdr ?? 1.0)))} XP
          </button>
        </div>
      )}

      {/* VIEW MODE 1: Gallery of all 6 Designs */}
      {viewMode === 'gallery' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              6 Rebuilt Design Directions
            </span>
            <span className="text-xs text-muted-foreground">
              Incorporating minimal dock geometry, Steam team backgrounds, money counter, loadout, and continuous stats
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {TELEMETRY_DESIGNS.map((design) => {
              const DesignComp = design.component
              const isSelected = activeDesignId === design.id

              return (
                <div
                  key={design.id}
                  className={`rounded-3xl p-5 bg-[var(--dk-surface-ghost)] backdrop-blur-2xl shadow-sm flex flex-col justify-between gap-4 transition-all ${
                    isSelected ? 'ring-2 ring-primary/40' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {design.id === 'cs2-steam-tactical-dock' && (
                          <Sparkles className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <h2 className="text-base font-black text-foreground tracking-tight truncate">
                          {design.title}
                        </h2>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/10 text-primary shrink-0">
                        {design.tag}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                      {design.description}
                    </p>
                  </div>

                  {/* Rendered Component */}
                  <div className="w-full">
                    <DesignComp telemetry={currentTelemetry} />
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--dk-separator)]">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {design.subtitle}
                    </span>
                    <button
                      onClick={() => {
                        setActiveDesignId(design.id)
                        setViewMode('focus')
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--dk-surface-field)] text-foreground hover:bg-primary hover:text-primary-foreground font-semibold text-xs tracking-tight transition-all"
                    >
                      Inspect in Shelf View
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: Focused Inspector */}
      {viewMode === 'focus' && (
        <div className="flex flex-col gap-6">
          {/* Tab Strip */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl shadow-xs">
            {TELEMETRY_DESIGNS.map((d, idx) => (
              <button
                key={d.id}
                onClick={() => setActiveDesignId(d.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeDesignId === d.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                #{idx + 1}: {d.tag}
              </button>
            ))}
          </div>

          {/* Active Design Details */}
          {(() => {
            const activeDesign = TELEMETRY_DESIGNS.find((d) => d.id === activeDesignId) || TELEMETRY_DESIGNS[0]
            return (
              <div className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl flex flex-col gap-1 shadow-sm">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-foreground">
                    {activeDesign.title}
                  </h2>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-primary/10 text-primary uppercase">
                    {activeDesign.tag}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {activeDesign.description}
                </p>
              </div>
            )
          })()}

          {/* Container Previews */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Activity Module Simulation */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Activity Panel Representation (Full Container Width)
              </span>

              <ActivityModuleSection>
                <div className="flex items-start gap-3">
                  <div className="w-14 h-20 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                    <Gamepad2 size={24} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                      Now Playing
                    </span>
                    <h3 className="text-base font-bold text-foreground truncate">
                      {currentTelemetry.gameTitle}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      Running on PC · 42m elapsed
                    </span>
                  </div>
                </div>

                <div className="w-full mt-3">
                  <ActivityModuleLiveTelemetry
                    telemetry={currentTelemetry}
                    designId={activeDesignId}
                  />
                </div>
              </ActivityModuleSection>
            </div>

            {/* Standalone Node Simulation */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Standalone Card & Token Verification
              </span>

              <div className="rounded-3xl p-5 bg-[var(--dk-surface-base)] backdrop-blur-3xl shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    Active Telemetry Node
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-primary/15 text-primary text-[10px] font-mono font-bold">
                    100ms Stream
                  </span>
                </div>

                <ActivityModuleLiveTelemetry
                  telemetry={currentTelemetry}
                  designId={activeDesignId}
                />

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Visible to Otix Friends
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Trophy className="h-3.5 w-3.5 text-primary" />
                    Live Feed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
