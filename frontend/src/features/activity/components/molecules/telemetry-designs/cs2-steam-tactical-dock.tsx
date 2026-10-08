import { Skull, Flame, Trophy } from 'lucide-react'
import type { UniversalGameTelemetry } from '@/features/activity/types/telemetry-types'
import {
  getCs2VitalsMetrics,
  getCs2BaseWeaponName,
  Cs2RealWeaponIcon,
  Cs2RealC4Icon,
  Cs2DefuseKitIcon,
  Cs2HelmetIcon,
  Cs2HealthCrossIcon,
  Cs2CtLogo,
  Cs2TLogo,
} from '@/features/activity/utils/telemetry-ui-helpers'

/**
 * Design 1: In-Game Source 2 HUD Replica (Flagship).
 * Modeled 1:1 on authentic Counter-Strike 2 in-game gameplay:
 * - Top: Map (R16) + connected team score container with illuminated active team underline
 * - Middle: CS2 Health (Red cross + bold white HP) & Armor (Helmet + AP) + Floating Cash ($4,850 / $250)
 * - Loadout: Full-width horizontal strip underneath vitals with pure vector silhouettes (Cyan Slot 1, Slot 2, Slot 3)
 * - Bottom: Clean continuous combat stats ribbon (21K / 11D · 5 Assists · 4 MVPs ★) with zero individual boxes
 */
export const Cs2SteamTacticalDock = ({ telemetry }: { telemetry: UniversalGameTelemetry }) => {
  const isDead =
    Boolean(telemetry.isSpectating) ||
    !telemetry.vitals ||
    (telemetry.vitals.health != null && telemetry.vitals.health <= 0)

  const isCt = (telemetry.statusSide || '').toUpperCase().includes('CT')
  const scoreA = telemetry.scores?.teamA?.score ?? 0
  const scoreB = telemetry.scores?.teamB?.score ?? 0
  const labelA = telemetry.scores?.teamA?.label ?? 'CT'
  const labelB = telemetry.scores?.teamB?.label ?? 'T'

  const { hp, ap, hpPercent, apPercent } = getCs2VitalsMetrics(
    isDead,
    telemetry.vitals?.health,
    telemetry.vitals?.armor
  )

  const money = telemetry.money ?? (isDead ? 1400 : 4850)
  const primaryWeapon = telemetry.loadout?.primary || (isCt ? 'M4A1-S' : 'AK-47')
  const secondaryWeapon = telemetry.loadout?.secondary || (isCt ? 'USP-S' : 'Glock-18')
  const knifeWeapon = telemetry.loadout?.knife || 'Knife'
  const primaryBase = getCs2BaseWeaponName(primaryWeapon)
  const secondaryBase = getCs2BaseWeaponName(secondaryWeapon)
  const knifeBase = getCs2BaseWeaponName(knifeWeapon)
  const hasKit = telemetry.loadout?.hasDefuser ?? isCt
  const hasBomb = telemetry.loadout?.hasBomb ?? !isCt

  const assistsStat = telemetry.stats?.find((s) => s.label.toLowerCase().includes('assist'))
  const mvpsStat = telemetry.stats?.find((s) => s.label.toLowerCase().includes('mvp'))

  return (
    <div
      data-testid="cs2-live-telemetry"
      className="w-full rounded-2xl bg-[#0c0e14]/90 border border-white/[0.08] backdrop-blur-2xl p-4 flex flex-col gap-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] text-xs transition-all font-sans relative overflow-hidden"
    >
      {/* 1st Row: Map + Round + Inline C4 Alert + Floating Cash + Connected Team Scores */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono font-black text-sm tracking-tight text-foreground uppercase truncate">
            {telemetry.mapOrZone || 'CS2'}
            {telemetry.roundOrLap != null && (
              <span className="text-muted-foreground ml-1.5 font-bold">
                {typeof telemetry.roundOrLap === 'number'
                  ? `(R${telemetry.roundOrLap})`
                  : telemetry.roundOrLap}
              </span>
            )}
          </span>

          {/* Compact Inline Bomb Planted Tag */}
          {telemetry.alert && (
            <span className="flex items-center gap-1 font-mono text-[11px] font-black uppercase tracking-wider text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse shrink-0">
              <Flame className="h-3.5 w-3.5" />
              {telemetry.alert.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* In-Game Floating Cash & Tactical Equipment */}
          <div className="flex items-center gap-2 font-mono">
            {hasKit && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-300 font-bold uppercase">
                <Cs2DefuseKitIcon className="h-3.5 w-3.5" />
              </span>
            )}
            {hasBomb && (
              <span className="flex items-center gap-1 text-[10px] text-rose-500 font-bold uppercase">
                <Cs2RealC4Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-black text-sm text-[#70b5e8] drop-shadow-[0_0_8px_rgba(112,181,232,0.45)] tracking-tight">
              ${money.toLocaleString()}
            </span>
          </div>

          {/* Single-Div Team Score Container with Active Underline Glow */}
          {telemetry.scores && (
            <div className="flex items-center rounded-lg overflow-hidden font-mono text-sm font-black shrink-0 shadow-md">
              {/* CT Side */}
              <div
                className={`px-2.5 py-1 bg-cs2-ct text-white relative transition-all flex items-center gap-1.5 ${
                  isCt ? 'opacity-100' : 'opacity-70'
                }`}
              >
                <Cs2CtLogo className="h-3.5 w-3.5 shrink-0" />
                <span className="text-cs2-ct sr-only">{labelA} {scoreA}</span>
                <span aria-hidden="true">{labelA} {scoreA}</span>
                {isCt && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                )}
              </div>

              {/* T Side */}
              <div
                className={`px-2.5 py-1 bg-cs2-t text-white relative transition-all flex items-center gap-1.5 ${
                  !isCt ? 'opacity-100' : 'opacity-70'
                }`}
              >
                <span className="text-cs2-t sr-only">{scoreB} {labelB}</span>
                <span aria-hidden="true">{scoreB} {labelB}</span>
                <Cs2TLogo className="h-3.5 w-3.5 shrink-0" />
                {!isCt && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                )}
              </div>

              <span className="sr-only">{labelA} {scoreA} : {scoreB} {labelB}</span>
            </div>
          )}
        </div>
      </div>

      <span className="sr-only">
        {telemetry.statusSide || (isCt ? 'Playing as CT' : 'Playing as T')}
      </span>

      {/* 2nd Row: In-Game Vitals Grid (Each label directly on top of its progress bar) */}
      <div className={`grid grid-cols-2 gap-3.5 w-full ${isDead ? 'opacity-75' : ''}`}>
        {/* Col 1: Health Column */}
        <div className="flex flex-col gap-2">
          {/* Health Label, Value & Icon (Directly on top of Health Bar) */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono font-black text-2xl tracking-tighter tabular-nums leading-none ${
                  isDead ? 'text-muted-foreground' : 'text-white'
                }`}
              >
                {hp}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase font-bold">
                HP
              </span>
              <span className="sr-only">Health</span>
              {isDead && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-black uppercase bg-destructive/20 text-destructive ml-0.5">
                  Dead
                </span>
              )}
            </div>
            <span className="flex items-center">
              {isDead ? (
                <Skull className="h-4 w-4 text-rose-500" />
              ) : (
                <Cs2HealthCrossIcon className="h-4 w-4 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
              )}
            </span>
          </div>

          {/* 10-Segment Health Meter */}
          <div className="grid grid-cols-10 gap-0.5 h-1.5 w-full">
            {Array.from({ length: 10 }).map((_, i) => {
              const active = hpPercent >= (i + 1) * 10
              return (
                <div
                  key={i}
                  className={`h-full rounded-[1px] transition-all ${
                    active
                      ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]'
                      : isDead
                        ? 'bg-rose-500/20'
                        : 'bg-white/10'
                  }`}
                />
              )
            })}
          </div>
        </div>

        {/* Col 2: Armor Column */}
        <div className="flex flex-col gap-2">
          {/* Armor Label, Value & Icon (Directly on top of Armor Bar) */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono font-black text-2xl tracking-tighter tabular-nums leading-none ${
                  isDead ? 'text-muted-foreground' : 'text-white'
                }`}
              >
                {ap}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase font-bold">
                AP
              </span>
              <span className="sr-only">Armor</span>
              {!isDead && telemetry.vitals?.hasSecondaryArmor && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase text-cyan-300 bg-cyan-500/10 ml-0.5">
                  +Helmet
                </span>
              )}
            </div>
            <span className="flex items-center">
              <Cs2HelmetIcon
                className={`h-4 w-4 ${
                  isDead ? 'text-muted-foreground' : 'text-cyan-300 drop-shadow-[0_0_6px_rgba(103,232,249,0.4)]'
                }`}
              />
            </span>
          </div>

          {/* Armor Progress Bar */}
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isDead ? 'bg-white/10' : 'bg-cyan-400 shadow-[0_0_6px_rgba(103,232,249,0.4)]'
              }`}
              style={{ width: `${apPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3rd Row: Authentic CS2 3-Slot Real Weapon Stack (Base Models, Underneath, Full Width) */}
      <div className="grid grid-cols-3 gap-3 w-full pt-2.5 pb-0.5 border-t border-white/[0.06] items-center">
        {/* Slot 1: Active Primary Real Weapon (Base Model) */}
        <div className="flex items-center justify-between text-[#70b5e8] drop-shadow-[0_0_6px_rgba(112,181,232,0.45)] min-w-0 pr-2">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={primaryBase}
              active
              slot={1}
              className="h-6 w-auto max-w-[85px] object-contain"
            />
            <span className="font-mono text-[9px] text-white/70 font-semibold truncate uppercase mt-0.5">
              {primaryBase}
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold text-white/40 before:content-['1'] shrink-0" />
        </div>

        {/* Slot 2: Secondary Pistol Real Icon (Base Model) */}
        <div className="flex items-center justify-between text-white/70 min-w-0 pr-2">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={secondaryBase}
              slot={2}
              className="h-5 w-auto max-w-[65px] object-contain"
            />
            <span className="font-mono text-[9px] text-white/50 font-semibold truncate uppercase mt-0.5">
              {secondaryBase}
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold text-white/30 before:content-['2'] shrink-0" />
        </div>

        {/* Slot 3: Tactical Knife Real Icon (Base Model) */}
        <div className="flex items-center justify-between text-white/60 min-w-0">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={knifeBase}
              slot={3}
              className="h-4.5 w-auto max-w-[65px] object-contain"
            />
            <span className="font-mono text-[9px] text-white/50 font-semibold truncate uppercase mt-0.5">
              {knifeBase}
            </span>
          </div>
          <span className="font-mono text-[11px] font-bold text-white/30 before:content-['3'] shrink-0" />
        </div>
      </div>

      {/* 4th Row: Unbroken Combat Stats (Zero Individual Boxes) */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] font-mono text-[11px] text-muted-foreground">
        {/* K/D summary */}
        {telemetry.summaryKda && (
          <span className="font-black text-foreground text-xs">
            {telemetry.summaryKda}
          </span>
        )}

        <div className="flex items-center gap-3">
          {assistsStat && (
            <span>
              <strong className="text-foreground">{assistsStat.value}</strong> Assists
            </span>
          )}
          {mvpsStat && (
            <span className="flex items-center gap-1 text-foreground">
              <strong className="text-foreground font-black">{mvpsStat.value}</strong> MVPs
              <Trophy className="h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
