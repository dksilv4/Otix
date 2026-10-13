import { useNavigate } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { ArrowUpRight, HelpCircle } from 'lucide-react'
import type { WelcomeFeature } from '../../constants/welcome-features'

export interface FeatureIntroCardProps {
  feature: WelcomeFeature
  onLearnMore: (feature: WelcomeFeature) => void
}

export const FeatureIntroCard = ({
  feature,
  onLearnMore,
}: FeatureIntroCardProps) => {
  const navigate = useNavigate()
  const Icon = feature.icon

  const handleQuickJump = () => {
    void navigate({ to: feature.route })
  }

  return (
    <div className="group relative flex flex-col justify-between rounded-3xl glass-card p-6 shadow-[var(--dk-shadow-glass)] transition-all duration-200 hover:bg-[var(--dk-surface-ghost-hover)]">
      <div className="space-y-4">
        {/* Top Header: Tinted Icon Pod & Direct Jump Icon */}
        <div className="flex items-center justify-between">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl glass-inset shadow-inner transition-transform duration-200 group-hover:scale-105"
            style={{
              color: feature.colorToken,
              backgroundColor: `color-mix(in srgb, ${feature.colorToken} 16%, transparent)`,
            }}
          >
            <Icon className="h-6 w-6" />
          </div>

          <button
            type="button"
            onClick={handleQuickJump}
            className="flex h-8 w-8 items-center justify-center rounded-xl glass-inset text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={feature.routeLabel}
            aria-label={feature.routeLabel}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        {/* Title & Descriptions */}
        <div className="space-y-1.5">
          <h3 className="text-base font-bold tracking-tight text-foreground">
            {feature.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {feature.shortDescription}
          </p>
        </div>

        {/* Core Highlights preview */}
        <div className="space-y-1.5 pt-1">
          {feature.highlights.slice(0, 2).map((highlight) => (
            <p
              key={highlight.title}
              className="text-xs text-muted-foreground leading-relaxed line-clamp-1"
            >
              <span className="font-medium text-foreground/90">{highlight.title}</span> — {highlight.description}
            </p>
          ))}
        </div>
      </div>

      {/* Card Actions */}
      <div className="mt-6 pt-4 border-t border-[var(--dk-separator)] flex items-center justify-between gap-3">
        <DkButton
          type="button"
          variant="secondary"
          size="md"
          onClick={() => onLearnMore(feature)}
          leftIcon={HelpCircle}
          className="rounded-xl text-xs font-medium"
        >
          What does this do?
        </DkButton>

        <DkButton
          type="button"
          variant="primary"
          size="md"
          onClick={handleQuickJump}
          className="px-5 rounded-xl text-xs font-semibold shadow-[var(--dk-shadow-sm)]"
        >
          Open
        </DkButton>
      </div>
    </div>
  )
}
