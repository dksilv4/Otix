import { Sparkles, Command, ShieldCheck, Gift } from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'

export interface SetupStepFeaturesProps {
  telemetryEnabled: boolean
  onToggleTelemetry: (enabled: boolean) => void
  freeGamesAlerts: boolean
  onToggleFreeGames: (enabled: boolean) => void
}

export const SetupStepFeatures = ({
  telemetryEnabled,
  onToggleTelemetry,
  freeGamesAlerts,
  onToggleFreeGames,
}: SetupStepFeaturesProps) => {
  const highlights = [
    {
      icon: Command,
      title: 'Command Palette (Cmd+K)',
      description: 'Search anything across movies, series, games, and settings instantly from anywhere in the app.',
    },
    {
      icon: Sparkles,
      title: 'Decide for Me',
      description: 'Stuck on what to watch or play? Launch the smart picker shaped by your genres and available time.',
    },
    {
      icon: ShieldCheck,
      title: 'Cloud Save Snapshots',
      description: 'Automatic backup snapshots of your game saves when closing titles, with cross-device restore.',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center sm:text-left">
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          Pro-Tips & Preferences
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Otix comes equipped with power-user tools to help you get the most out of your collection.
        </p>
      </div>

      {/* Highlights Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {highlights.map((h) => {
          const Icon = h.icon
          return (
            <div
              key={h.title}
              className="rounded-2xl glass-inset p-4 space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl glass-inset text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h4 className="text-xs font-bold text-foreground">
                  {h.title}
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {h.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick preference toggles */}
      <div className="rounded-2xl glass-inset p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 text-primary" />
              Free Games Claiming Alerts
            </span>
            <p className="text-[11px] text-muted-foreground">
              Notify when weekly free games and promotions are claimable across digital storefronts.
            </p>
          </div>
          <DkSwitch
            checked={freeGamesAlerts}
            onCheckedChange={onToggleFreeGames}
          />
        </div>

        <div className="border-t border-white/[0.04] pt-3 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Game Telemetry & Session Hours
            </span>
            <p className="text-[11px] text-muted-foreground">
              Track in-game framerates, session duration, and earn gamer progression XP.
            </p>
          </div>
          <DkSwitch
            checked={telemetryEnabled}
            onCheckedChange={onToggleTelemetry}
          />
        </div>
      </div>
    </div>
  )
}
