import { Monitor, Server, Cloud, Check } from 'lucide-react'

export interface SetupStepWelcomeProps {
  selectedMode: 'desktop' | 'node' | 'cloud'
  onSelectMode: (mode: 'desktop' | 'node' | 'cloud') => void
}

export const SetupStepWelcome = ({
  selectedMode,
  onSelectMode,
}: SetupStepWelcomeProps) => {
  const options = [
    {
      id: 'desktop' as const,
      title: 'Desktop All-in-One',
      description:
        'Local launcher, automatic game scanner, unified media catalog, and offline telemetry on this device.',
      badge: 'Recommended',
      icon: Monitor,
      tags: ['Game Scanner', 'Live Telemetry', 'Local Saves'],
    },
    {
      id: 'node' as const,
      title: 'Self-Hosted Companion',
      description:
        'Connect with an Otix Node daemon on your network for streaming, downloads, and remote cloud save backups.',
      badge: 'Advanced',
      icon: Server,
      tags: ['Otix Node Daemon', 'Media Streaming', 'Cloud Saves'],
    },
    {
      id: 'cloud' as const,
      title: 'Cloud Explorer',
      description:
        'Browse cinema and gaming recommendations, curate custom lists, and synchronize watch activity across devices.',
      badge: 'Lightweight',
      icon: Cloud,
      tags: ['Personalized Feed', 'Unified Watchlist', 'Cross-Device'],
    },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center sm:text-left">
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          How do you want to use Otix?
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose your primary setup mode to tailor the introduction experience. You can link remote servers and game paths anytime.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const Icon = opt.icon
          const isSelected = selectedMode === opt.id

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectMode(opt.id)}
              className={`group relative flex items-start sm:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 glass-inset ${
                isSelected
                  ? 'ring-2 ring-primary/60 bg-[var(--dk-surface-ghost-hover)] shadow-[var(--dk-shadow-sm)]'
                  : 'hover:bg-[var(--dk-surface-ghost-hover)]'
              }`}
            >
              <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                <div
                  className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'glass-inset text-muted-foreground group-hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>

                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-foreground">
                      {opt.title}
                    </h4>
                    {opt.badge && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          isSelected
                            ? 'bg-primary/20 text-primary'
                            : 'glass-inset text-muted-foreground'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {opt.description}
                  </p>

                  <div className="hidden sm:flex flex-wrap items-center gap-1.5 pt-0.5">
                    {opt.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-[var(--dk-surface-ghost)] px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-1 sm:pt-0 shrink-0 self-start sm:self-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-[var(--dk-surface-ghost)] text-muted-foreground group-hover:bg-primary/20'
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
