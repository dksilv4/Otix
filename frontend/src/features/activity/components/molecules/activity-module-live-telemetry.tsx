import { Heart, Shield, Flame, Info } from 'lucide-react'
import type { UniversalGameTelemetry } from '../../types/telemetry-types'
import { getTelemetryStatIcon } from '../../utils/telemetry-ui-helpers'
import { TELEMETRY_DESIGNS, Cs2SteamTacticalDock } from './telemetry-designs'

interface ActivityModuleLiveTelemetryProps {
  telemetry: UniversalGameTelemetry
  designId?: string
}

/**
 * Universal Game Telemetry view for non-CS2 games.
 */
const UniversalTelemetryView = ({ telemetry }: { telemetry: UniversalGameTelemetry }) => {
  const healthPercent =
    telemetry.vitals?.health != null
      ? Math.min(100, Math.max(0, telemetry.vitals.health))
      : null

  const armorPercent =
    telemetry.vitals?.armor != null
      ? Math.min(100, Math.max(0, telemetry.vitals.armor))
      : null

  return (
    <div
      data-testid="universal-live-telemetry"
      className="w-full rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-2xl p-3.5 flex flex-col gap-3 transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {telemetry.mapOrZone && (
            <span className="font-bold text-foreground text-sm tracking-tight truncate">
              {telemetry.mapOrZone}
            </span>
          )}
          {telemetry.roundOrLap != null && (
            <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold bg-[var(--dk-surface-field)] text-muted-foreground shrink-0">
              {typeof telemetry.roundOrLap === 'number'
                ? `(R${telemetry.roundOrLap})`
                : telemetry.roundOrLap}
            </span>
          )}
        </div>

        {telemetry.scores?.teamA && (
          <div className="flex items-center shrink-0">
            <div className="flex items-center rounded-lg overflow-hidden bg-[var(--dk-surface-field)] backdrop-blur-md shadow-sm font-mono text-xs font-bold px-2.5 py-1 text-primary">
              {telemetry.scores.teamB ? (
                <>
                  {telemetry.scores.teamA.label} {telemetry.scores.teamA.score} : {telemetry.scores.teamB.score} {telemetry.scores.teamB.label}
                </>
              ) : (
                <>
                  {telemetry.scores.teamA.label} {telemetry.scores.teamA.score}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phase / Alerts */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {telemetry.alert ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                telemetry.alert.type === 'danger'
                  ? 'bg-destructive/15 text-destructive animate-pulse'
                  : 'bg-primary/15 text-primary'
              }`}
            >
              {telemetry.alert.type === 'danger' ? (
                <Flame className="h-3.5 w-3.5" />
              ) : (
                <Info className="h-3.5 w-3.5" />
              )}
              {telemetry.alert.text}
            </span>
          ) : telemetry.phase ? (
            <span className="text-muted-foreground font-medium text-[11px]">
              {telemetry.phase}
            </span>
          ) : null}
        </div>

        {telemetry.statusSide && (
          <span className="text-[11px] font-medium text-muted-foreground shrink-0">
            {telemetry.statusSide}
          </span>
        )}
      </div>

      {/* Vitals */}
      {(healthPercent != null || armorPercent != null) && (
        <div className="grid grid-cols-2 gap-2.5">
          {healthPercent != null && (
            <div className="rounded-xl bg-[var(--dk-surface-field)] backdrop-blur-md p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Heart className="h-3.5 w-3.5 text-destructive" />
                  Health
                </span>
                <span className="font-mono font-bold text-foreground tabular-nums">
                  {telemetry.vitals?.health}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all duration-300 rounded-full"
                  style={{ width: `${healthPercent}%` }}
                />
              </div>
            </div>
          )}

          {armorPercent != null && (
            <div className="rounded-xl bg-[var(--dk-surface-field)] backdrop-blur-md p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Armor
                </span>
                <span className="font-mono font-bold text-foreground tabular-nums">
                  {telemetry.vitals?.armor}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${armorPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      {telemetry.stats && telemetry.stats.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {telemetry.summaryKda && (
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="font-mono text-muted-foreground text-[10px] uppercase tracking-wider">
                Performance
              </span>
              <span className="font-mono font-semibold text-foreground tabular-nums text-xs">
                {telemetry.summaryKda}
              </span>
            </div>
          )}

          <div
            className={`grid gap-2 ${
              telemetry.stats.length === 2
                ? 'grid-cols-2'
                : telemetry.stats.length === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-4'
            }`}
          >
            {telemetry.stats.map((stat, idx) => (
              <div
                key={`${stat.label}-${idx}`}
                className="flex flex-col items-center justify-center py-2 px-1 rounded-xl bg-[var(--dk-surface-field)] backdrop-blur-md transition-colors"
              >
                <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  {getTelemetryStatIcon(stat.iconType)}
                  {stat.label}
                </span>
                <span className="font-mono font-bold text-foreground text-sm tabular-nums mt-0.5">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Universal Game Telemetry Card rendered in the Activity panel and profile shelves.
 * Automatically switches to game-specific HUD presentation based on the title.
 */
export const ActivityModuleLiveTelemetry = ({
  telemetry,
  designId,
}: ActivityModuleLiveTelemetryProps) => {
  if (telemetry.activity === 'lobby' || telemetry.activity === 'menu') {
    return (
      <div
        data-testid={telemetry.id === 'cs2' ? 'cs2-lobby-telemetry' : 'universal-lobby-telemetry'}
        className="w-full rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl p-3.5 flex items-center justify-between gap-3 text-xs transition-all shadow-sm"
      >
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground tracking-tight truncate">
            In Lobby
          </span>
          <span className="text-[11px] text-muted-foreground truncate mt-0.5">
            {telemetry.playerName
              ? `${telemetry.playerName} · Waiting for match`
              : 'Waiting for match'}
          </span>
        </div>

        <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
          Ready
        </span>
      </div>
    )
  }

  // If a specific design is requested, render that design
  if (designId) {
    const custom = TELEMETRY_DESIGNS.find((d) => d.id === designId)
    if (custom) {
      const CustomDesign = custom.component
      return <CustomDesign telemetry={telemetry} />
    }
  }

  const isCs2 =
    telemetry.id === 'cs2' ||
    telemetry.gameTitle.toLowerCase().includes('counter-strike')

  if (isCs2) {
    return <Cs2SteamTacticalDock telemetry={telemetry} />
  }

  return <UniversalTelemetryView telemetry={telemetry} />
}
