import { cn } from '@/lib/utils'

export type FeatureStatusKind = 'beta' | 'wip' | 'alpha'

const KIND_STYLES: Record<FeatureStatusKind, string> = {
  beta: 'border-amber-400/25 bg-amber-400/10 text-amber-200/80',
  wip: 'border-sky-400/25 bg-sky-400/10 text-sky-200/80',
  alpha: 'border-violet-400/25 bg-violet-400/10 text-violet-200/80',
}

const KIND_LABELS: Record<FeatureStatusKind, string> = {
  beta: 'Beta',
  wip: 'Under development',
  alpha: 'Alpha',
}

/** Short labels for cramped UI (settings sidebar). */
const KIND_SHORT_LABELS: Record<FeatureStatusKind, string> = {
  beta: 'Beta',
  wip: 'WIP',
  alpha: 'Alpha',
}

export function FeatureStatusTag({
  kind,
  short = false,
  className,
}: {
  kind: FeatureStatusKind
  short?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
        KIND_STYLES[kind],
        className,
      )}
    >
      {short ? KIND_SHORT_LABELS[kind] : KIND_LABELS[kind]}
    </span>
  )
}

export function FeatureStatusTags({
  kinds,
  short = false,
  className,
}: {
  kinds: FeatureStatusKind[]
  short?: boolean
  className?: string
}) {
  if (kinds.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {kinds.map((kind) => (
        <FeatureStatusTag key={kind} kind={kind} short={short} />
      ))}
    </span>
  )
}

/** Map plugin manifest stage → status chips (stable → none). */
export function kindsFromPluginStage(stage?: string | null): FeatureStatusKind[] {
  if (stage === 'alpha') return ['alpha']
  if (stage === 'beta') return ['beta']
  return []
}
