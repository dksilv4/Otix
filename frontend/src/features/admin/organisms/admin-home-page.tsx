import { Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { BarChart3, Pencil, FlaskConical, Droplets, ArrowRight, Calendar } from 'lucide-react'
import { DkBadge } from '@/features/dk-ui/atoms/badge'
import { ADMIN_BLOG_POSTS } from '../admin-blog.types'
import { EXPERIMENTS, MATURITY_LABELS } from '@/features/experiments/experiments.types'
import { EXPERIMENTS_ADMIN, getReadinessStats, PIPELINE_EFFICIENCY, MEDIA_TYPES, getEfficiencyScore } from '@/features/experiments/experiments-admin.types'

const SUBPAGES = [
  {
    to: '/admin/dashboard',
    icon: BarChart3,
    label: 'Dashboard',
    description:
      'Stats, metrics, enrichment pipeline, user registrations, and time-series charts.',
  },
  {
    to: '/admin/proposals',
    icon: Pencil,
    label: 'Proposals',
    description:
      'Community edit proposals review queue with approve, reject, and undo workflows.',
  },
  {
    to: '/admin/experiments',
    icon: FlaskConical,
    label: 'Experiments',
    description:
      'Feature maturity tracking, readiness checklists, and cross-feature integration matrix.',
  },
  {
    to: '/admin/hydration',
    icon: Droplets,
    label: 'Hydration',
    description:
      'Track media data completeness — check which items are missing posters, credits, genres, embeddings, and more.',
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function computeQuickStats() {
  const alphaCount = EXPERIMENTS.filter(e => e.maturity === 'alpha').length
  const betaCount = EXPERIMENTS.filter(e => e.maturity === 'beta').length
  const prodCount = EXPERIMENTS.filter(e => e.maturity === 'production').length

  let totalDone = 0
  let totalCriteria = 0
  for (const key of EXPERIMENTS.map(e => e.key)) {
    const meta = EXPERIMENTS_ADMIN[key]
    if (meta) {
      const stats = getReadinessStats(meta)
      totalDone += stats.done
      totalCriteria += stats.total
    }
  }
  const readinessPct = totalCriteria > 0 ? Math.round((totalDone / totalCriteria) * 100) : 0

  const pipelineScores = MEDIA_TYPES.map(mt => getEfficiencyScore(PIPELINE_EFFICIENCY[mt]))
  const avgPipeline = Math.round(pipelineScores.reduce((a, b) => a + b, 0) / pipelineScores.length)

  return { alphaCount, betaCount, prodCount, readinessPct, avgPipeline }
}

export function AdminHomePage() {
  const stats = computeQuickStats()

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Helmet>
        <title>Admin - Otix</title>
      </Helmet>

      <h1 className="mb-8 text-2xl font-bold tracking-[-0.02em]">Admin</h1>

      {/* Quick stats */}
      <section className="mb-8 grid gap-3 grid-cols-2 sm:grid-cols-5">
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Alpha</p>
          <p className="text-lg font-bold text-red-400 tabular-nums">{stats.alphaCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Beta</p>
          <p className="text-lg font-bold text-amber-400 tabular-nums">{stats.betaCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Production</p>
          <p className="text-lg font-bold text-green-400 tabular-nums">{stats.prodCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Readiness</p>
          <p className="text-lg font-bold tabular-nums">{stats.readinessPct}%</p>
        </div>
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-3 shadow-[var(--dk-shadow-sm)] text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Pipeline</p>
          <p className="text-lg font-bold tabular-nums">{stats.avgPipeline}%</p>
        </div>
      </section>

      {/* Subpage links */}
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBPAGES.map((page) => {
            const Icon = page.icon
            return (
              <Link
                key={page.to}
                to={page.to}
                className="group rounded-2xl bg-[var(--dk-surface-base)] p-5 shadow-[var(--dk-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--dk-shadow-md)]"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 text-sm font-semibold group-hover:text-primary transition-colors">
                  {page.label}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {page.description}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Blog / internal docs */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Documentation
        </h2>
        <div className="space-y-4">
          {ADMIN_BLOG_POSTS.map((post) => (
            <Link
              key={post.slug}
              to="/admin/blog/$slug"
              params={{ slug: post.slug }}
              className="block rounded-2xl bg-[var(--dk-surface-base)] p-5 shadow-[var(--dk-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--dk-shadow-md)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="mb-1 text-sm font-semibold group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="mb-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {post.summary}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <Calendar className="h-3 w-3" />
                      {formatDate(post.date)}
                    </span>
                    {post.tags.map((tag) => (
                      <DkBadge key={tag} variant="muted" size="sm">
                        {tag}
                      </DkBadge>
                    ))}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground/40 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
