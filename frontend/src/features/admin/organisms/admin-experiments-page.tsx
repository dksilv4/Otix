// TODO: Review this file
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
import './admin-experiments-page.scss'
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
    <div className="dk-admin-exp-page">
      <Helmet>
        <title>Experiments - Admin - Otix</title>
      </Helmet>

      <h1 className="dk-admin-exp-page__heading">Feature Maturity</h1>
      <p className="dk-admin-exp-page__description">
        Readiness checklists, cross-integration, media type coverage, and pipeline efficiency for every experiment.
      </p>

      {/* Summary bar */}
      <div className="dk-admin-exp-page__summary">
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Total</p>
          <p className="dk-admin-exp-page__stat-value">{experimentKeys.length}</p>
        </div>
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Alpha</p>
          <p className="dk-admin-exp-page__stat-value dk-admin-exp-page__stat-value--alpha">{stats.alphaCount}</p>
        </div>
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Beta</p>
          <p className="dk-admin-exp-page__stat-value dk-admin-exp-page__stat-value--beta">{stats.betaCount}</p>
        </div>
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Production</p>
          <p className="dk-admin-exp-page__stat-value dk-admin-exp-page__stat-value--prod">{stats.prodCount}</p>
        </div>
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Readiness</p>
          <p className="dk-admin-exp-page__stat-value">{stats.overallPct}%</p>
          <div className="dk-admin-exp-page__progress">
            <div className="dk-admin-exp-page__progress-bar dk-admin-exp-page__progress-bar--blue" style={{ width: `${stats.overallPct}%` }} />
          </div>
        </div>
        <div className="dk-admin-exp-page__stat-card">
          <p className="dk-admin-exp-page__stat-label">Pipelines</p>
          <p className="dk-admin-exp-page__stat-value">{stats.avgPipeline}%</p>
          <div className="dk-admin-exp-page__progress">
            <div
              className={cn(
                'dk-admin-exp-page__progress-bar',
                stats.avgPipeline >= 80 ? 'dk-admin-exp-page__progress-bar--high' : stats.avgPipeline >= 50 ? 'dk-admin-exp-page__progress-bar--mid' : 'dk-admin-exp-page__progress-bar--low',
              )}
              style={{ width: `${stats.avgPipeline}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="dk-admin-exp-page__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'dk-admin-exp-page__tab',
              activeTab === tab.key && 'dk-admin-exp-page__tab--active',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Readiness Checklist */}
      {activeTab === 'readiness' && (
        <section>
          <div className="dk-admin-exp-page__section">
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
                  className="dk-admin-exp-page__feature"
                >
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className="dk-admin-exp-page__feature-header"
                  >
                    <ChevronDown
                      className={cn(
                        'dk-admin-exp-page__feature-chevron',
                        isOpen && 'dk-admin-exp-page__feature-chevron--open',
                      )}
                    />
                    <div className="dk-admin-exp-page__feature-name">
                      <div className="dk-admin-exp-page__feature-title">
                        <span className="dk-admin-exp-page__feature-name-text">{exp.name}</span>
                        <DkBadge variant={MATURITY_BADGE_VARIANT[exp.maturity]} size="sm">
                          {MATURITY_LABELS[exp.maturity]}
                        </DkBadge>
                      </div>
                    </div>
                    <div className="dk-admin-exp-page__feature-stats">
                      {/* Progress bar */}
                      <div className="dk-admin-exp-page__feature-progress">
                        <div className="dk-admin-exp-page__feature-bar">
                          <div
                            className="dk-admin-exp-page__feature-bar-fill dk-admin-exp-page__feature-bar-fill--done"
                            style={{ width: `${meta.readinessCriteria.length > 0 ? (doneCount / meta.readinessCriteria.length) * 100 : 0}%` }}
                          />
                          <div
                            className="dk-admin-exp-page__feature-bar-fill dk-admin-exp-page__feature-bar-fill--partial"
                            style={{ width: `${meta.readinessCriteria.length > 0 ? (partialCount / meta.readinessCriteria.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="dk-admin-exp-page__feature-pct">
                          {featureStats.criteria.pct}%
                        </span>
                      </div>
                      {/* Counts */}
                      <div className="dk-admin-exp-page__feature-counts">
                        <span className="dk-admin-exp-page__count-done">{doneCount}</span>
                        <span className="dk-admin-exp-page__count-sep">/</span>
                        <span className="dk-admin-exp-page__count-partial">{partialCount}</span>
                        <span className="dk-admin-exp-page__count-sep">/</span>
                        <span className="dk-admin-exp-page__count-missing">{missingCount}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="dk-admin-exp-page__feature-body">
                      <div className="dk-admin-exp-page__criteria">
                        {meta.readinessCriteria.map((c, i) => {
                          const { icon: Icon, className } = STATUS_ICON[c.status] ?? STATUS_ICON.missing
                          return (
                            <div
                              key={i}
                              className="dk-admin-exp-page__criterion"
                            >
                              <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', className)} />
                              <div>
                                <span className="dk-admin-exp-page__criterion-label">{c.label}</span>
                                {c.note && (
                                  <p className="dk-admin-exp-page__criterion-note">{c.note}</p>
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
          <div className="dk-admin-exp-page__table-wrapper">
            <table className="dk-admin-exp-page__table">
              <thead>
                <tr>
                  <th className="dk-admin-exp-page__table-header">
                    Feature
                  </th>
                  {experimentKeys.map((key) => {
                    const exp = EXPERIMENTS.find((e) => e.key === key)
                    return (
                      <th key={key} className="dk-admin-exp-page__table-cell dk-admin-exp-page__table-cell--th">
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
                    <tr key={rowKey} className="dk-admin-exp-page__table-row">
                      <td className="dk-admin-exp-page__table-label">
                        <div className="dk-admin-exp-page__table-label-inner">
                          <span className="text-[11px] font-medium leading-tight whitespace-nowrap">
                            {rowExp?.name ?? rowKey}
                          </span>
                        </div>
                      </td>
                      {experimentKeys.map((colKey) => {
                        if (rowKey === colKey) {
                          return (
                            <td key={colKey} className="dk-admin-exp-page__table-cell">
                              <span className="dk-admin-exp-page__table-self-badge" />
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
                          <td key={colKey} className="dk-admin-exp-page__table-cell">
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

          <div className="dk-admin-exp-page__table-legend">
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
                <span key={status} className="dk-admin-exp-page__table-legend-item">
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
          <div className="dk-admin-exp-page__table-wrapper">
            <table className="dk-admin-exp-page__table">
              <thead>
                <tr>
                  <th className="dk-admin-exp-page__table-header dk-admin-exp-page__table-header--media">
                    Feature
                  </th>
                  {MEDIA_TYPES.map((mt) => (
                    <th key={mt} className="dk-admin-exp-page__table-cell--media-th">
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
                    <tr key={rowKey} className="dk-admin-exp-page__table-row">
                      <td className="dk-admin-exp-page__table-label dk-admin-exp-page__table-label--media">
                        <div className="dk-admin-exp-page__table-label-inner">
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
                          <td key={mt} className="dk-admin-exp-page__table-cell dk-admin-exp-page__table-cell--media">
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

          <div className="dk-admin-exp-page__table-legend">
            {(
              [
                { status: 'full' as MediaTypeSupport, label: 'Full support' },
                { status: 'partial' as MediaTypeSupport, label: 'Partial' },
                { status: 'none' as MediaTypeSupport, label: 'None / N/A' },
              ]
            ).map(({ status, label }) => (
              <span key={status} className="dk-admin-exp-page__table-legend-item">
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
          <div className="dk-admin-exp-page__pipeline-grid">
            {MEDIA_TYPES.map((mt) => {
              const pipeline = PIPELINE_EFFICIENCY[mt]
              const score = getEfficiencyScore(pipeline)
              const doneProviders = pipeline.providers.filter((p) => p.status === 'done').length
              const totalProviders = pipeline.providers.length

              return (
                <div key={mt} className="dk-admin-exp-page__pipeline-card">
                  <div className="dk-admin-exp-page__pipeline-card-header">
                    <p className="dk-admin-exp-page__pipeline-card-label">{MEDIA_TYPE_LABELS[mt]}</p>
                    <span
                      className={cn(
                        'dk-admin-exp-page__score-text',
                        score >= 80 ? 'dk-admin-exp-page__score-text--high' : score >= 50 ? 'dk-admin-exp-page__score-text--mid' : 'dk-admin-exp-page__score-text--low',
                      )}
                    >
                      {score}%
                    </span>
                  </div>
                  <div className="dk-admin-exp-page__pipeline-bar">
                    <div
                      className={cn(
                        'dk-admin-exp-page__pipeline-bar-fill',
                        score >= 80 ? 'dk-admin-exp-page__pipeline-bar-fill--high' : score >= 50 ? 'dk-admin-exp-page__pipeline-bar-fill--mid' : 'dk-admin-exp-page__pipeline-bar-fill--low',
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <div className="dk-admin-exp-page__pipeline-card-sub">
                    <span>{totalProviders} providers</span>
                    <span>{doneProviders}/{totalProviders} operational</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detail cards */}
          <div className="dk-admin-exp-page__pipeline-detail-list">
            {MEDIA_TYPES.map((mt) => {
              const pipeline = PIPELINE_EFFICIENCY[mt]
              const score = getEfficiencyScore(pipeline)

              return (
                <div
                  key={mt}
                  className="dk-admin-exp-page__pipeline-detail"
                >
                  <div className="dk-admin-exp-page__pipeline-detail-grid">
                    {/* Left column: metadata */}
                    <div>
                      <div className="dk-admin-exp-page__pipeline-detail-header">
                        <div className="dk-admin-exp-page__pipeline-detail-title">
                          <h3 className="dk-admin-exp-page__pipeline-detail-h3">{MEDIA_TYPE_LABELS[mt]}</h3>
                          <span
                            className={cn(
                              'dk-admin-exp-page__score-text',
                              score >= 80 ? 'dk-admin-exp-page__score-text--high' : score >= 50 ? 'dk-admin-exp-page__score-text--mid' : 'dk-admin-exp-page__score-text--low',
                            )}
                          >
                            {score}%
                          </span>
                        </div>
                      </div>

                      <div className="dk-admin-exp-page__pipeline-bar">
                        <div
                          className={cn(
                            'dk-admin-exp-page__pipeline-bar-fill',
                            score >= 80 ? 'dk-admin-exp-page__pipeline-bar-fill--high' : score >= 50 ? 'dk-admin-exp-page__pipeline-bar-fill--mid' : 'dk-admin-exp-page__pipeline-bar-fill--low',
                          )}
                          style={{ width: `${score}%` }}
                        />
                      </div>

                      {/* Seeding */}
                      <div className="dk-admin-exp-page__pipeline-seeding">
                        {pipeline.seedingStatus === 'done' ? (
                          <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-500" />
                        ) : pipeline.seedingStatus === 'partial' ? (
                          <MinusCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-red-400" />
                        )}
                        <div>
                          <p className="dk-admin-exp-page__pipeline-section-title">Seeding</p>
                          <p className="dk-admin-exp-page__pipeline-seeding-desc">
                            {pipeline.seedingMethod}
                          </p>
                          {pipeline.seedingNote && (
                            <p className="dk-admin-exp-page__pipeline-seeding-note">
                              {pipeline.seedingNote}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Providers */}
                      <div className="dk-admin-exp-page__pipeline-providers">
                        <p className="dk-admin-exp-page__pipeline-section-title dk-admin-exp-page__pipeline-section-title--mb">
                          Providers ({pipeline.providers.filter((p) => p.status === 'done').length}/{pipeline.providers.length})
                        </p>
                        <div className="dk-admin-exp-page__pipeline-provider-list">
                          {pipeline.providers.map((provider, i) => {
                            const isProviderDone = provider.status === 'done'
                            const isProviderMissing = provider.status === 'missing'
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'dk-admin-exp-page__pipeline-provider',
                                  isProviderMissing && 'dk-admin-exp-page__pipeline-provider--missing',
                                )}
                              >
                                {isProviderDone ? (
                                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-500" />
                                ) : isProviderMissing ? (
                                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/30" />
                                ) : (
                                  <MinusCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" />
                                )}
                                <div className="dk-admin-exp-page__pipeline-provider-info">
                                  <div className="dk-admin-exp-page__pipeline-provider-header">
                                    <span className="dk-admin-exp-page__pipeline-provider-name">{provider.name}</span>
                                    <span className="dk-admin-exp-page__pipeline-provider-schedule">{provider.schedule}</span>
                                  </div>
                                  {provider.note && (
                                    <p className="dk-admin-exp-page__pipeline-provider-note">
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
                          <p className="dk-admin-exp-page__pipeline-gap-title">
                            Gaps ({pipeline.gaps.length})
                          </p>
                          <ul className="dk-admin-exp-page__pipeline-gap-list">
                            {pipeline.gaps.map((gap, i) => (
                              <li key={i} className="dk-admin-exp-page__pipeline-gap">
                                <span className="dk-admin-exp-page__pipeline-gap-bullet" />
                                {gap}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right column: flow diagram */}
                    <div>
                      <p className="dk-admin-exp-page__pipeline-section-title dk-admin-exp-page__pipeline-section-title--mb">Pipeline Flow</p>
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
