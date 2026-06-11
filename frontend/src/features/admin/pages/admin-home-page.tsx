// TODO: Review this file
import { Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { BarChart3, Pencil, FlaskConical, Droplets, ArrowRight, Calendar } from 'lucide-react'
import { DkBadge } from '@/features/dk-ui/atoms/badge'
import { ADMIN_BLOG_POSTS } from '../admin-blog.types'
import { EXPERIMENTS } from '@/features/experiments/experiments.types'

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
    <div className="dk-admin-home-page">
      <Helmet>
        <title>Admin - Otix</title>
      </Helmet>

      <h1 className="dk-admin-home-page__title">Admin</h1>

      {/* Quick stats */}
      <section className="dk-admin-home-page__stats">
        <div className="dk-admin-home-page__stat-card">
          <p className="dk-admin-home-page__stat-label">Alpha</p>
          <p className="dk-admin-home-page__stat-value dk-admin-home-page__stat-value--alpha">{stats.alphaCount}</p>
        </div>
        <div className="dk-admin-home-page__stat-card">
          <p className="dk-admin-home-page__stat-label">Beta</p>
          <p className="dk-admin-home-page__stat-value dk-admin-home-page__stat-value--beta">{stats.betaCount}</p>
        </div>
        <div className="dk-admin-home-page__stat-card">
          <p className="dk-admin-home-page__stat-label">Production</p>
          <p className="dk-admin-home-page__stat-value dk-admin-home-page__stat-value--production">{stats.prodCount}</p>
        </div>
        <div className="dk-admin-home-page__stat-card">
          <p className="dk-admin-home-page__stat-label">Readiness</p>
          <p className="dk-admin-home-page__stat-value">{stats.readinessPct}%</p>
        </div>
        <div className="dk-admin-home-page__stat-card">
          <p className="dk-admin-home-page__stat-label">Avg Pipeline</p>
          <p className="dk-admin-home-page__stat-value">{stats.avgPipeline}%</p>
        </div>
      </section>

      {/* Subpage links */}
      <section className="dk-admin-home-page__subpages">
        <h2 className="dk-admin-home-page__section-heading">
          Tools
        </h2>
        <div className="dk-admin-home-page__subpage-grid">
          {SUBPAGES.map((page) => {
            const Icon = page.icon
            return (
              <Link
                key={page.to}
                to={page.to}
                className="dk-admin-home-page__subpage-card"
              >
                <div className="dk-admin-home-page__subpage-icon">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="dk-admin-home-page__subpage-title">
                  {page.label}
                </h3>
                <p className="dk-admin-home-page__subpage-desc">
                  {page.description}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Blog / internal docs */}
      <section>
        <h2 className="dk-admin-home-page__section-heading">
          Documentation
        </h2>
        <div className="dk-admin-home-page__blog-list">
          {ADMIN_BLOG_POSTS.map((post) => (
            <Link
              key={post.slug}
              to="/admin/blog/$slug"
              params={{ slug: post.slug }}
              className="dk-admin-home-page__blog-card"
            >
              <div className="dk-admin-home-page__blog-inner">
                <div className="dk-admin-home-page__blog-text">
                  <h3 className="dk-admin-home-page__blog-title">
                    {post.title}
                  </h3>
                  <p className="dk-admin-home-page__blog-summary">
                    {post.summary}
                  </p>
                  <div className="dk-admin-home-page__blog-meta">
                    <span className="dk-admin-home-page__blog-date">
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
