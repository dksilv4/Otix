// TODO: Review this file
import { useExperiments } from '../experiments-provider'
import { MATURITY_LABELS, MATURITY_BADGE_VARIANT } from '../experiments.types'
import type { Maturity } from '../experiments.types'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { DkBadge } from '@/features/dk-ui/atoms/badge'
import { cn } from '@/lib/utils'
import './experiments-section.scss'

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
    <div className="dk-experiments">
      {order.map((maturity) => {
        const items = grouped[maturity]
        if (!items?.length) return null

        return (
          <div key={maturity}>
            <h3 className={cn('dk-experiments__heading', `dk-experiments__heading--${maturity}`)}>
              {MATURITY_LABELS[maturity]}
            </h3>
            <div className="dk-experiments__list">
              {items.map((exp) => (
                <div key={exp.key} className="dk-experiments__card">
                  <div className="dk-experiments__card-body">
                    <div className="dk-experiments__card-content">
                      <div className="dk-experiments__card-header">
                        <h4 className="dk-experiments__card-name">{exp.name}</h4>
                        <DkBadge variant={MATURITY_BADGE_VARIANT[exp.maturity]} size="sm">
                          {MATURITY_LABELS[exp.maturity]}
                        </DkBadge>
                      </div>
                      <p className="dk-experiments__card-description">
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
        <p className="dk-experiments__empty">No experiments available.</p>
      )}
    </div>
  )
}
