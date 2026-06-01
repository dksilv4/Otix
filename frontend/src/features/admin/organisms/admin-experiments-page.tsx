import { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  CheckCircle,
  MinusCircle,
  XCircle,
  ChevronDown,
  Circle,
  CircleDot,
  CircleDashed,
} from 'lucide-react'
import { DkBadge } from '@/features/dk-ui/atoms/badge'
import { EXPERIMENTS, MATURITY_LABELS, MATURITY_BADGE_VARIANT } from '@/features/experiments/experiments.types'
import {
  EXPERIMENTS_ADMIN,
  getReadinessStats,
  getEfficiencyScore,
  MEDIA_TYPES,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_SUPPORT_ICON,
  PIPELINE_EFFICIENCY,
  type CriterionStatus,
  type IntegrationStatus,
  type MediaTypeSupport,
} from '@/features/experiments/experiments-admin.types'
import { cn } from '@/lib/utils'
import { PipelineFlowDiagram } from '@/features/admin/molecules/pipeline-flow-diagram'

const STATUS_ICON: Record<CriterionStatus, { icon: typeof CheckCircle; className: string }> = {
  done: { icon: CheckCircle, className: 'text-green-500' },
  partial: { icon: MinusCircle, className: 'text-amber-500' },
  missing: { icon: XCircle, className: 'text-red-400' },
}



const INTEGRATION_ICON: Record<IntegrationStatus, { icon: typeof Circle; className: string; label: string }> = {
  integrated: { icon: CircleDot, className: 'text-green-500', label: 'Integrated' },
  partial: { icon: CircleDashed, className: 'text-amber-500', label: 'Partial' },
  planned: { icon: Circle, className: 'text-blue-400', label: 'Planned' },
  none: { icon: Circle, className: 'text-muted-foreground/15', label: 'None' },
}

const experimentKeys = EXPERIMENTS.map((e) => e.key)

type Tab = 'readiness' | 'integrations' | 'media' | 'pipelines'

const TABS: { key: Tab; label: string }[] = [
  { key: 'readiness', label: 'Readiness' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'media', label: 'Media Coverage' },
  { key: 'pipelines', label: 'Pipelines' },
]

export function AdminExperimentsPage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<Tab>('readiness')

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

  const stats = useMemo(() => {
    const allStats = experimentKeys.map((key) => {
      const meta = EXPERIMENTS_ADMIN[key]
      return meta ? getReadinessStats(meta) : null
    })

    const overallDone = allStats.reduce((sum, s) => sum + (s?.done ?? 0), 0)
    const overallTotal = allStats.reduce((sum, s) => sum + (s?.total ?? 0), 0)
    const criteriaTotal = allStats.reduce((sum, s) => sum + (s?.criteria.total ?? 0), 0)
    const criteriaDone = allStats.reduce((sum, s) => sum + (s?.criteria.done ?? 0), 0)
    const mediaTotal = allStats.reduce((sum, s) => sum + (s?.media.total ?? 0), 0)
    const mediaDone = allStats.reduce((sum, s) => sum + (s?.media.done ?? 0), 0)

    const pipelineScores = MEDIA_TYPES.map((mt) => getEfficiencyScore(PIPELINE_EFFICIENCY[mt]))
    const avgPipeline = Math.round(pipelineScores.reduce((a, b) => a + b, 0) / pipelineScores.length)

    const alphaCount = EXPERIMENTS.filter((e) => e.maturity === 'alpha').length
    const betaCount = EXPERIMENTS.filter((e) => e.maturity === 'beta').length
    const prodCount = EXPERIMENTS.filter((e) => e.maturity === 'production').length

    return {
      overallDone,
      overallTotal,
      overallPct: overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0,
      criteriaTotal,
      criteriaDone,
      criteriaPct: criteriaTotal > 0 ? Math.round((criteriaDone / criteriaTotal) * 100) : 0,
      mediaTotal,
      mediaDone,
      mediaPct: mediaTotal > 0 ? Math.round((mediaDone / mediaTotal) * 100) : 0,
      avgPipeline,
      alphaCount,
      betaCount,
      prodCount,
    }
  }, [])

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Helmet>
        <title>Experiments - Admin - Otix</title>
      </Helmet>

      <h1 className="mb-2 text-2xl font-bold tracking-[-0.02em]">Feature Maturity</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Readiness checklists, cross-integration, media type coverage, and pipeline efficiency for every experiment.
      </p>

      {/* Summary bar */}
      <div className="mb-8 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
          <p className="text-xl font-bold tabular-nums">{experimentKeys.length}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alpha</p>
          <p className="text-xl font-bold tabular-nums text-red-400">{stats.alphaCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Beta</p>
          <p className="text-xl font-bold tabular-nums text-amber-400">{stats.betaCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Production</p>
          <p className="text-xl font-bold tabular-nums text-green-400">{stats.prodCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Readiness</p>
          <p className="text-xl font-bold tabular-nums">{stats.overallPct}%</p>
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden mx-auto">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${stats.overallPct}%` }} />
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pipelines</p>
          <p className="text-xl font-bold tabular-nums">{stats.avgPipeline}%</p>
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden mx-auto">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                stats.avgPipeline >= 80 ? 'bg-green-500' : stats.avgPipeline >= 50 ? 'bg-amber-500' : 'bg-red-400',
              )}
              style={{ width: `${stats.avgPipeline}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-xl bg-[var(--dk-surface-base)] p-1 shadow-[var(--dk-shadow-sm)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Readiness Checklist */}
      {activeTab === 'readiness' && (
        <section>
          <div className="space-y-3">
            {experimentKeys.map((key) => {
              const exp = EXPERIMENTS.find((e) => e.key === key)
              const meta = EXPERIMENTS_ADMIN[key]
              if (!exp || !meta) return null

              const featureStats = getReadinessStats(meta)
              const isOpen = expanded[key]
              const doneCount = meta.readinessCriteria.filter((c) => c.status === 'done').length
              const partialCount = meta.readinessCriteria.filter((c) => c.status === 'partial').length
              const missingCount = meta.readinessCriteria.filter((c) => c.status === 'missing').length

              return (
                <div
                  key={key}
                  className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{exp.name}</span>
                        <DkBadge variant={MATURITY_BADGE_VARIANT[exp.maturity]} size="sm">
                          {MATURITY_LABELS[exp.maturity]}
                        </DkBadge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Progress bar */}
                      <div className="hidden sm:flex items-center gap-1.5">
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden flex">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${meta.readinessCriteria.length > 0 ? (doneCount / meta.readinessCriteria.length) * 100 : 0}%` }}
                          />
                          <div
                            className="h-full bg-amber-500 transition-all"
                            style={{ width: `${meta.readinessCriteria.length > 0 ? (partialCount / meta.readinessCriteria.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                          {featureStats.criteria.pct}%
                        </span>
                      </div>
                      {/* Counts */}
                      <div className="flex items-center gap-2 text-[10px] tabular-nums">
                        <span className="text-green-500">{doneCount}</span>
                        <span className="text-muted-foreground/30">/</span>
                        <span className="text-amber-500">{partialCount}</span>
                        <span className="text-muted-foreground/30">/</span>
                        <span className="text-muted-foreground/40">{missingCount}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-border/30">
                      <div className="mt-3 space-y-1.5">
                        {meta.readinessCriteria.map((c, i) => {
                          const { icon: Icon, className } = STATUS_ICON[c.status] ?? STATUS_ICON.missing
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-2.5 rounded-lg px-2.5 py-1.5"
                            >
                              <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', className)} />
                              <div>
                                <span className="text-sm">{c.label}</span>
                                {c.note && (
                                  <p className="text-xs text-muted-foreground/60 mt-0.5">{c.note}</p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Cross-integration matrix */}
      {activeTab === 'integrations' && (
        <section>
          <div className="overflow-x-auto rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--dk-surface-base)] p-3 text-left font-medium text-muted-foreground min-w-[130px]">
                    Feature
                  </th>
                  {experimentKeys.map((key) => {
                    const exp = EXPERIMENTS.find((e) => e.key === key)
                    return (
                      <th key={key} className="p-2 text-center font-medium whitespace-nowrap min-w-[72px]">
                        <span className="text-[11px] leading-tight">{exp?.name ?? key}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {experimentKeys.map((rowKey) => {
                  const rowMeta = EXPERIMENTS_ADMIN[rowKey]
                  const rowExp = EXPERIMENTS.find((e) => e.key === rowKey)
                  return (
                    <tr key={rowKey} className="border-t border-border/20 hover:bg-[var(--dk-surface-ghost-hover)]">
                      <td className="sticky left-0 z-10 bg-[var(--dk-surface-base)] p-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium leading-tight whitespace-nowrap">
                            {rowExp?.name ?? rowKey}
                          </span>
                        </div>
                      </td>
                      {experimentKeys.map((colKey) => {
                        if (rowKey === colKey) {
                          return (
                            <td key={colKey} className="p-2 text-center">
                              <span className="inline-block w-2 h-2 rounded-full bg-muted/20" />
                            </td>
                          )
                        }

                        const colMeta = EXPERIMENTS_ADMIN[colKey]
                        const forward = rowMeta?.integrations.find((i) => i.targetFeature === colKey)
                        const reverse = colMeta?.integrations.find((i) => i.targetFeature === rowKey)

                        const statusRank: Record<IntegrationStatus, number> = {
                          integrated: 3,
                          partial: 2,
                          planned: 1,
                          none: 0,
                        }

                        const best =
                          statusRank[forward?.status ?? 'none'] >= statusRank[reverse?.status ?? 'none']
                            ? forward
                            : reverse

                        const status: IntegrationStatus = best?.status ?? 'none'
                        const { icon: Icon, className } = INTEGRATION_ICON[status] ?? INTEGRATION_ICON.none
                        const tooltip = best?.note ?? (status !== 'none' ? INTEGRATION_ICON[status].label : undefined)

                        return (
                          <td key={colKey} className="p-2 text-center">
                            <span title={tooltip} className="cursor-default">
                              <Icon className={cn('h-3.5 w-3.5 inline-block', className)} />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-5 flex-wrap text-xs text-muted-foreground">
            {(
              [
                { status: 'integrated', label: 'Integrated' },
                { status: 'partial', label: 'Partial' },
                { status: 'planned', label: 'Planned' },
                { status: 'none', label: 'None' },
              ] as const
            ).map(({ status, label }) => {
              const { icon: Icon, className } = INTEGRATION_ICON[status] ?? INTEGRATION_ICON.none
              return (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', className)} />
                  {label}
                </span>
              )
            })}
          </div>
        </section>
      )}

      {/* Media type coverage matrix */}
      {activeTab === 'media' && (
        <section>
          <div className="overflow-x-auto rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--dk-surface-base)] p-3 text-left font-medium text-muted-foreground min-w-[150px]">
                    Feature
                  </th>
                  {MEDIA_TYPES.map((mt) => (
                    <th key={mt} className="p-3 text-center font-medium text-muted-foreground min-w-[80px]">
                      {MEDIA_TYPE_LABELS[mt]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experimentKeys.map((rowKey) => {
                  const meta = EXPERIMENTS_ADMIN[rowKey]
                  const rowExp = EXPERIMENTS.find((e) => e.key === rowKey)
                  if (!meta) return null

                  return (
                    <tr key={rowKey} className="border-t border-border/20 hover:bg-[var(--dk-surface-ghost-hover)]">
                      <td className="sticky left-0 z-10 bg-[var(--dk-surface-base)] p-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{rowExp?.name ?? rowKey}</span>
                          <DkBadge
                            variant={rowExp ? MATURITY_BADGE_VARIANT[rowExp.maturity] : 'muted'}
                            size="sm"
                          >
                            {rowExp ? MATURITY_LABELS[rowExp.maturity] : rowKey}
                          </DkBadge>
                        </div>
                      </td>
                      {MEDIA_TYPES.map((mt) => {
                        const coverage = meta.mediaTypeSupport.find((m) => m.mediaType === mt)
                        const status: MediaTypeSupport = coverage?.status ?? 'none'
                        const note = coverage?.note

                        return (
                          <td key={mt} className="p-3 text-center">
                            <span title={note ?? MEDIA_TYPE_SUPPORT_ICON[status].label} className="cursor-default">
                              <CircleDot
                                className={cn(
                                  'h-3.5 w-3.5 inline-block',
                                  status === 'full' && 'text-green-500',
                                  status === 'partial' && 'text-amber-500',
                                  status === 'none' && 'text-muted-foreground/12',
                                )}
                                fill={status === 'none' ? 'transparent' : 'currentColor'}
                              />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-5 flex-wrap text-xs text-muted-foreground">
            {(
              [
                { status: 'full' as MediaTypeSupport, label: 'Full support' },
                { status: 'partial' as MediaTypeSupport, label: 'Partial' },
                { status: 'none' as MediaTypeSupport, label: 'None / N/A' },
              ]
            ).map(({ status, label }) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <CircleDot
                  className={cn('h-3.5 w-3.5', MEDIA_TYPE_SUPPORT_ICON[status].className)}
                  fill={status === 'none' ? 'transparent' : 'currentColor'}
                />
                {label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Pipeline efficiency */}
      {activeTab === 'pipelines' && (
        <section>
          {/* Summary strip */}
          <div className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-4">
            {MEDIA_TYPES.map((mt) => {
              const pipeline = PIPELINE_EFFICIENCY[mt]
              const score = getEfficiencyScore(pipeline)
              const doneProviders = pipeline.providers.filter((p) => p.status === 'done').length
              const totalProviders = pipeline.providers.length

              return (
                <div key={mt} className="rounded-2xl bg-[var(--dk-surface-base)] p-4 shadow-[var(--dk-shadow-sm)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{MEDIA_TYPE_LABELS[mt]}</p>
                    <span
                      className={cn(
                        'text-sm font-bold tabular-nums',
                        score >= 80 ? 'text-green-500' : score >= 50 ? 'text-amber-500' : 'text-red-400',
                      )}
                    >
                      {score}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-2">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400',
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
                    <span>{totalProviders} providers</span>
                    <span>{doneProviders}/{totalProviders} operational</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detail cards */}
          <div className="grid gap-4">
            {MEDIA_TYPES.map((mt) => {
              const pipeline = PIPELINE_EFFICIENCY[mt]
              const score = getEfficiencyScore(pipeline)

              return (
                <div
                  key={mt}
                  className="rounded-2xl bg-[var(--dk-surface-base)] p-5 shadow-[var(--dk-shadow-sm)]"
                >
                  <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
                    {/* Left column: metadata */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{MEDIA_TYPE_LABELS[mt]}</h3>
                          <span
                            className={cn(
                              'text-sm font-bold tabular-nums',
                              score >= 80 ? 'text-green-500' : score >= 50 ? 'text-amber-500' : 'text-red-400',
                            )}
                          >
                            {score}%
                          </span>
                        </div>
                      </div>

                      <div className="mb-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400',
                          )}
                          style={{ width: `${score}%` }}
                        />
                      </div>

                      {/* Seeding */}
                      <div className="mb-4 flex items-start gap-2">
                        {pipeline.seedingStatus === 'done' ? (
                          <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-500" />
                        ) : pipeline.seedingStatus === 'partial' ? (
                          <MinusCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-400" />
                        )}
                        <div>
                          <p className="text-xs font-medium">Seeding</p>
                          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                            {pipeline.seedingMethod}
                          </p>
                          {pipeline.seedingNote && (
                            <p className="text-[10px] text-muted-foreground/50 mt-0.5 italic">
                              {pipeline.seedingNote}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Providers */}
                      <div className="mb-4">
                        <p className="text-xs font-medium mb-1.5">
                          Providers ({pipeline.providers.filter((p) => p.status === 'done').length}/{pipeline.providers.length})
                        </p>
                        <div className="space-y-1">
                          {pipeline.providers.map((provider, i) => {
                            const isProviderDone = provider.status === 'done'
                            const isProviderMissing = provider.status === 'missing'
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'flex items-start gap-1.5 rounded-md px-1.5 py-1',
                                  isProviderMissing ? 'opacity-40' : '',
                                )}
                              >
                                {isProviderDone ? (
                                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" />
                                ) : isProviderMissing ? (
                                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/30" />
                                ) : (
                                  <MinusCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" />
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-medium">{provider.name}</span>
                                    <span className="text-[10px] text-muted-foreground/50">{provider.schedule}</span>
                                  </div>
                                  {provider.note && (
                                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                                      {provider.note}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Gaps */}
                      {pipeline.gaps.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1 text-amber-600 dark:text-amber-400">
                            Gaps ({pipeline.gaps.length})
                          </p>
                          <ul className="space-y-0.5">
                            {pipeline.gaps.map((gap, i) => (
                              <li key={i} className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
                                <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500/50 flex-shrink-0" />
                                {gap}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right column: flow diagram */}
                    <div>
                      <p className="text-xs font-medium mb-1.5">Pipeline Flow</p>
                      <PipelineFlowDiagram stages={pipeline.flow} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
