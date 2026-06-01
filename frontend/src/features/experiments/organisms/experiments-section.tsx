import { useExperiments } from '../experiments-provider'
import { MATURITY_LABELS, MATURITY_COLORS, MATURITY_BADGE_VARIANT } from '../experiments.types'
import type { Maturity } from '../experiments.types'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { DkBadge } from '@/features/dk-ui/atoms/badge'
import { cn } from '@/lib/utils'

export function ExperimentsSection() {
  const { isEnabled, setEnabled, experiments } = useExperiments()

  const grouped = experiments.reduce<Record<Maturity, typeof experiments>>(
    (acc, exp) => {
      (acc[exp.maturity] ??= []).push(exp)
      return acc
    },
    {} as Record<Maturity, typeof experiments>,
  )

  const order: Maturity[] = ['alpha', 'beta', 'production']

  return (
    <div className="space-y-8">
      {order.map((maturity) => {
        const items = grouped[maturity]
        if (!items?.length) return null

        return (
          <div key={maturity}>
            <h3 className={cn('mb-3 text-sm font-semibold uppercase tracking-wider', MATURITY_COLORS[maturity])}>
              {MATURITY_LABELS[maturity]}
            </h3>
            <div className="space-y-3">
              {items.map((exp) => (
                <div
                  key={exp.key}
                  className="rounded-2xl bg-[var(--dk-surface-base)] p-5 shadow-[var(--dk-shadow-sm)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold">{exp.name}</h4>
                        <DkBadge variant={MATURITY_BADGE_VARIANT[exp.maturity]} size="sm">
                          {MATURITY_LABELS[exp.maturity]}
                        </DkBadge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {exp.description}
                      </p>
                    </div>
                    <DkSwitch
                      checked={isEnabled(exp.key)}
                      onCheckedChange={(checked) => setEnabled(exp.key, checked)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {experiments.length === 0 && (
        <p className="text-sm text-muted-foreground">No experiments available.</p>
      )}
    </div>
  )
}
