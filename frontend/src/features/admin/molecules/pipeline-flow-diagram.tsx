import { CheckCircle, MinusCircle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStage, CriterionStatus } from '@/features/experiments/experiments-admin.types'

const STATUS_STYLE: Record<CriterionStatus, { icon: typeof CheckCircle; badge: string; iconColor: string }> = {
  done: {
    icon: CheckCircle,
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30',
    iconColor: 'text-green-500',
  },
  partial: {
    icon: MinusCircle,
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    iconColor: 'text-amber-500',
  },
  missing: {
    icon: XCircle,
    badge: 'bg-muted-foreground/10 text-muted-foreground/50 border-muted-foreground/15',
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
    <div className="relative pl-7">
      {/* Full backbone: connects first dot to last dot */}
      <div
        className="absolute left-[7px] w-px bg-muted-foreground/15"
        style={{ top: '12px', bottom: '12px' }}
      />

      <div className="space-y-0">
        {stages.map((stage, i) => {
          const { icon: Icon, badge, iconColor } = STATUS_STYLE[stage.status] ?? STATUS_STYLE.missing
          const isMissing = stage.status === 'missing'

          return (
            <div key={i} className="pb-3 last:pb-0">
              <div className="flex items-start gap-2.5">
                {/* Dot column: covers the backbone line */}
                <div className="relative z-10 flex-shrink-0 mt-1 rounded-full bg-[var(--dk-surface-base)] p-0.5">
                  <Icon className={cn('h-3.5 w-3.5', iconColor)} />
                </div>

                {/* Stage card */}
                <div
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2',
                    isMissing
                      ? 'bg-muted/10 border-muted-foreground/10'
                      : 'bg-[var(--dk-surface-raised)] border-border/30',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isMissing ? 'text-muted-foreground/40' : 'text-foreground',
                        )}
                      >
                        {stage.label}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium border', badge)}>
                        {STATUS_LABEL[stage.status]}
                      </span>
                    </div>
                    {stage.schedule && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50 flex-shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                        {stage.schedule}
                      </span>
                    )}
                  </div>
                  {stage.note && (
                    <p
                      className={cn(
                        'mt-1 text-[11px] leading-relaxed',
                        isMissing ? 'text-muted-foreground/30' : 'text-muted-foreground/60',
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
