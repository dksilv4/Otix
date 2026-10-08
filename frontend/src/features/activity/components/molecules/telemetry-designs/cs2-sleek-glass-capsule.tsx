import { Heart, Shield, Flame, Skull, Trophy } from 'lucide-react'
import type { UniversalGameTelemetry } from '@/features/activity/types/telemetry-types'
import {
  getCs2VitalsMetrics,
  getCs2BaseWeaponName,
  Cs2CtLogo,
  Cs2TLogo,
  Cs2RealWeaponIcon,
  Cs2RealC4Icon,
  Cs2DefuseKitIcon,
} from '@/features/activity/utils/telemetry-ui-helpers'

/**
 * Design 4: Sleek Glass Capsule.
 * Smooth rounded capsule layout indicating active player team on the team capsule,
 * floating cash counter, full-width 3-slot vector loadout strip underneath vitals,
 * and unbroken combat stats ribbon.
 */
export const Cs2SleekGlassCapsule = ({ telemetry }: { telemetry: UniversalGameTelemetry }) => {
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
      className="w-full rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl p-3.5 flex flex-col gap-2.5 shadow-sm text-xs transition-all"
    >
      {/* 1st Row: Map + Round + Inline Alert + Cash/Equipment + Single-Div Team Capsules */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-extrabold text-foreground truncate">
            {telemetry.mapOrZone || 'CS2'}
          </span>
          {telemetry.roundOrLap != null && (
            <span className="font-mono text-[10px] text-muted-foreground font-bold shrink-0">
              {typeof telemetry.roundOrLap === 'number'
                ? `(R${telemetry.roundOrLap})`
                : telemetry.roundOrLap}
            </span>
          )}
          {telemetry.alert && (
            <span className="flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-destructive animate-pulse shrink-0">
              <Flame className="h-3 w-3" />
              {telemetry.alert.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Floating Money & Tactical Equipment */}
          <div className="flex items-center gap-2">
            {hasKit && (
              <span className="flex items-center gap-0.5 font-mono text-[10px] text-cyan-300 font-bold uppercase">
                <Cs2DefuseKitIcon className="h-3.5 w-3.5" />
              </span>
            )}
            {hasBomb && (
              <span className="flex items-center gap-0.5 font-mono text-[10px] text-rose-500 font-bold uppercase">
                <Cs2RealC4Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-mono font-black text-sm text-[#70b5e8] drop-shadow-[0_0_6px_rgba(112,181,232,0.45)]">
              ${money.toLocaleString()}
            </span>
          </div>

          {/* Single-Div Team Capsules: Highlight Active Team */}
          {telemetry.scores && (
            <div className="flex items-center rounded-full overflow-hidden font-mono font-black text-xs shrink-0 shadow-xs">
              <div
                className={`px-2 py-0.5 bg-cs2-ct text-white relative transition-all flex items-center gap-1 ${
                  isCt ? 'opacity-100 ring-inset ring-1 ring-white/30 font-black' : 'opacity-70'
                }`}
              >
                <Cs2CtLogo className="h-3 w-3 shrink-0" />
                <span className="text-cs2-ct sr-only">{labelA} {scoreA}</span>
                <span aria-hidden="true">{labelA} {scoreA}</span>
                {isCt && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/90" />
                )}
              </div>
              <div
                className={`px-2 py-0.5 bg-cs2-t text-white relative transition-all flex items-center gap-1 ${
                  !isCt ? 'opacity-100 ring-inset ring-1 ring-white/30 font-black' : 'opacity-70'
                }`}
              >
                <span className="text-cs2-t sr-only">{scoreB} {labelB}</span>
                <span aria-hidden="true">{scoreB} {labelB}</span>
                <Cs2TLogo className="h-3 w-3 shrink-0" />
                {!isCt && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/90" />
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
      <div className={`grid grid-cols-2 gap-2.5 w-full ${isDead ? 'opacity-70' : ''}`}>
        {/* Col 1: Health Column */}
        <div className="flex flex-col gap-1.5">
          {/* Health Label, Value & Icon (Directly on top of Health Bar) */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-black tabular-nums leading-none ${
                  isDead ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {hp}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground uppercase font-bold">HP</span>
              <span className="sr-only">Health</span>
              {isDead && (
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-mono font-black uppercase bg-destructive/15 text-destructive ml-0.5">
                  Dead
                </span>
              )}
            </div>
            {isDead ? (
              <Skull className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Heart className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>

          {/* Health Bar */}
          <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isDead ? 'bg-destructive/20' : 'bg-destructive'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
        </div>

        {/* Col 2: Armor Column */}
        <div className="flex flex-col gap-1.5">
          {/* Armor Label, Value & Icon (Directly on top of Armor Bar) */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-base font-black tabular-nums leading-none ${
                  isDead ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                {ap}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground uppercase font-bold">AP</span>
              <span className="sr-only">Armor</span>
              {!isDead && telemetry.vitals?.hasSecondaryArmor && (
                <span className="px-1.5 py-0.2 rounded-full text-[8px] font-bold uppercase text-chart-2 ml-0.5">
                  +H
                </span>
              )}
            </div>
            <Shield className={`h-3.5 w-3.5 ${isDead ? 'text-muted-foreground' : 'text-chart-2'}`} />
          </div>

          {/* Armor Bar */}
          <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isDead ? 'bg-muted/30' : 'bg-chart-2'
              }`}
              style={{ width: `${apPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3rd Row: Authentic CS2 3-Slot Vector Loadout (Underneath, Full Width) */}
      <div className="grid grid-cols-3 gap-3 w-full pt-2 border-t border-white/[0.04] items-center">
        {/* Slot 1: Active Primary */}
        <div className="flex items-center justify-between text-[#70b5e8] min-w-0 pr-1">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={primaryBase}
              active
              slot={1}
              className="h-5 w-auto max-w-[70px] object-contain drop-shadow-[0_0_6px_rgba(112,181,232,0.45)]"
            />
            <span className="font-mono text-[9px] text-white/70 font-semibold truncate uppercase mt-0.5">
              {primaryBase}
            </span>
          </div>
          <span className="font-mono text-[10px] font-bold text-white/40 before:content-['1'] shrink-0" />
        </div>

        {/* Slot 2: Secondary Pistol */}
        <div className="flex items-center justify-between text-white/70 min-w-0 pr-1">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={secondaryBase}
              slot={2}
              className="h-4.5 w-auto max-w-[55px] object-contain"
            />
            <span className="font-mono text-[9px] text-white/50 font-semibold truncate uppercase mt-0.5">
              {secondaryBase}
            </span>
          </div>
          <span className="font-mono text-[10px] font-bold text-white/30 before:content-['2'] shrink-0" />
        </div>

        {/* Slot 3: Tactical Knife */}
        <div className="flex items-center justify-between text-white/60 min-w-0">
          <div className="flex flex-col min-w-0">
            <Cs2RealWeaponIcon
              weapon={knifeBase}
              slot={3}
              className="h-4 w-auto max-w-[55px] object-contain"
            />
            <span className="font-mono text-[9px] text-white/50 font-semibold truncate uppercase mt-0.5">
              {knifeBase}
            </span>
          </div>
          <span className="font-mono text-[10px] font-bold text-white/30 before:content-['3'] shrink-0" />
        </div>
      </div>

      {/* 4th Row: Unbroken Combat Stats Ribbon */}
      <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.04] text-[11px] font-mono text-muted-foreground">
        {telemetry.summaryKda && (
          <span className="font-bold text-foreground">{telemetry.summaryKda}</span>
        )}

        <div className="flex items-center gap-3">
          {assistsStat && (
            <span>
              <strong className="text-foreground">{assistsStat.value}</strong> Assists
            </span>
          )}
          {mvpsStat && (
            <span className="flex items-center gap-0.5 text-foreground font-bold">
              <strong className="text-foreground">{mvpsStat.value}</strong> MVPs
              <Trophy className="h-3 w-3 text-chart-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
