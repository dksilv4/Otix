import { useNavigate } from '@tanstack/react-router'
import { Link2, Compass, Gamepad2, ArrowRight } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'

export const WelcomeGettingStartedSteps = () => {
  const navigate = useNavigate()
  const steps = [
    {
      step: '01',
      title: 'Connect & Sync',
      description:
        'Link external services, media servers, or point to local folders to populate your collection.',
      icon: Link2,
      color: 'var(--media-show)',
      actionLabel: 'Setup Connections',
      route: '/settings/integrations',
    },
    {
      step: '02',
      title: 'Explore & Curate',
      description:
        'Search cinema and games, preview trailers, build custom lists, and try the Decide for Me picker.',
      icon: Compass,
      color: 'var(--primary)',
      actionLabel: 'Browse Feed',
      route: '/',
    },
    {
      step: '03',
      title: 'Play & Level Up',
      description:
        'Launch titles from your desktop launcher, track hours, and unlock gamer rank tiers and badges.',
      icon: Gamepad2,
      color: 'var(--media-game)',
      actionLabel: 'Open Launcher',
      route: '/launcher',
    },
  ]

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] glass-card p-7 sm:p-9 shadow-[var(--dk-shadow-glass)] space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Getting Started in 3 Simple Steps
        </h2>
        <p className="text-xs text-muted-foreground">
          Jump straight into setup or explore at your own pace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {steps.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.step}
              className="group relative flex flex-col justify-between rounded-2xl glass-inset p-5 transition-all duration-200 hover:bg-[var(--dk-surface-ghost-hover)]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl shadow-inner"
                    style={{
                      color: item.color,
                      backgroundColor: `color-mix(in srgb, ${item.color} 15%, transparent)`,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-muted-foreground/60">
                    {item.step}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-[var(--dk-separator)]">
                <DkButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void navigate({ to: item.route })}
                  rightIcon={ArrowRight}
                  className="w-full justify-between text-xs font-semibold"
                >
                  {item.actionLabel}
                </DkButton>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
