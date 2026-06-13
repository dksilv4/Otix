// TODO: Review this file
import './pipeline-flow-diagram.scss'
import { CheckCircle, MinusCircle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStage, CriterionStatus } from '@/old-features/experiments/experiments-admin.types'

const STATUS_STYLE: Record<CriterionStatus, { icon: typeof CheckCircle; badge: string; iconColor: string }> = {
  done: {
    icon: CheckCircle,
    badge: 'dk-admin-pipeline-flow__badge--done',
    iconColor: 'text-green-500',
  },
  partial: {
    icon: MinusCircle,
    badge: 'dk-admin-pipeline-flow__badge--partial',
    iconColor: 'text-amber-500',
  },
  missing: {
    icon: XCircle,
    badge: 'dk-admin-pipeline-flow__badge--missing',
    iconColor: 'text-muted-foreground/25',
  },
}

const STATUS_LABEL: Record<CriterionStatus, string> = {
  done: 'Operational',
  partial: 'Partial',
  missing: 'Not built',
}

export function PipelineFlowDiagram({ stages }: { stages: PipelineStage[] }) {
  if (stages.length === 0) return null

  // Dot center X: pl-7 (28px) + dot width (16px) / 2 = 36px from container edge
  //   or equivalently: 8px from the inner edge of the padding
  // We use left-[7px] because the dot wrapper is 16px wide, center is at 8px.
  // The connector line at 7px sits 1px left of center, which is close enough
  // and avoids sub-pixel rendering.

  return (
    <div className="dk-admin-pipeline-flow">
      {/* Full backbone: connects first dot to last dot */}
      <div
        className="dk-admin-pipeline-flow__backbone"
        style={{ top: '12px', bottom: '12px' }}
      />

      <div className="dk-admin-pipeline-flow__list">
        {stages.map((stage, i) => {
          const { icon: Icon, badge, iconColor } = STATUS_STYLE[stage.status] ?? STATUS_STYLE.missing
          const isMissing = stage.status === 'missing'

          return (
            <div key={i} className="dk-admin-pipeline-flow__stage">
              <div className="dk-admin-pipeline-flow__stage-row">
                {/* Dot column: covers the backbone line */}
                <div className="dk-admin-pipeline-flow__dot">
                  <Icon className={cn('h-3.5 w-3.5', iconColor)} />
                </div>

                {/* Stage card */}
                <div
                  className={cn(
                    'dk-admin-pipeline-flow__card',
                    isMissing && 'dk-admin-pipeline-flow__card--missing',
                  )}
                >
                  <div className="dk-admin-pipeline-flow__card-header">
                    <div className="dk-admin-pipeline-flow__label-group">
                      <span
                        className={cn(
                          'dk-admin-pipeline-flow__label',
                          isMissing && 'dk-admin-pipeline-flow__label--missing',
                        )}
                      >
                        {stage.label}
                      </span>
                      <span className={cn('dk-admin-pipeline-flow__badge', badge)}>
                        {STATUS_LABEL[stage.status]}
                      </span>
                    </div>
                    {stage.schedule && (
                      <span className="dk-admin-pipeline-flow__schedule">
                        <Clock className="h-2.5 w-2.5" />
                        {stage.schedule}
                      </span>
                    )}
                  </div>
                  {stage.note && (
                    <p
                      className={cn(
                        'dk-admin-pipeline-flow__note',
                        isMissing && 'dk-admin-pipeline-flow__note--missing',
                      )}
                    >
                      {stage.note}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
