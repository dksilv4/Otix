// TODO: Review this file
import { useState, useEffect, useCallback, useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { ArrowPathIcon } from "@heroicons/react/24/solid"
import { useAuth } from "@/features/auth"
import { Navigate } from "@tanstack/react-router"
import { useAdminStats, useAdminMetrics, REFETCH_INTERVAL } from "@/features/admin/admin-queries"
import type { EnrichmentCounts } from "@/features/admin/admin-queries"
import { LineChart } from "@/features/admin/molecules/line-chart"
import { cn } from "@/lib/utils"
import { Skeleton } from "@ui/atoms/skeleton"

const MEDIA_LABELS: Record<string, string> = {
  movie: "Movies",
  show: "TV Shows",
  music: "Music",
  game: "Games",
  person: "People",
}

const PROVIDER_LABELS: Record<string, string> = {
  fanart: "Fanart",
  omdb: "OMDb",
  igdb: "IGDB",
  steam: "Steam",
  steamgrid: "SteamGrid",
  musicbrainz: "MusicBrainz",
  lastfm: "Last.fm",
  spotify: "Spotify",
  embedding: "Embedding",
  imdb: "IMDb",
}

const ENRICHMENT_PROVIDERS: Record<string, string[]> = {
  movie: ["fanart", "omdb", "embedding"],
  show: ["fanart", "omdb", "embedding"],
  music: ["fanart", "musicbrainz", "lastfm", "spotify", "embedding"],
  game: ["fanart", "igdb", "steam", "steamgrid", "embedding"],
  person: ["fanart", "spotify", "musicbrainz", "imdb"],
}

function EnrichmentCard({
  type,
  counts,
  delta,
}: {
  type: string
  counts: EnrichmentCounts
  delta: EnrichmentCounts
}) {
  const providers = ENRICHMENT_PROVIDERS[type] ?? []
  const label = MEDIA_LABELS[type] ?? type

  return (
    <div className="dk-admin-dashboard__enrichment-card">
      <p className="dk-admin-dashboard__enrichment-label">
        {label}
      </p>
      <div className="dk-admin-dashboard__enrichment-list">
        <div className="dk-admin-dashboard__enrichment-row">
          <span className="dk-admin-dashboard__enrichment-row-label">Total</span>
          <span className="dk-admin-dashboard__enrichment-row-value">
            {counts.total.toLocaleString()}
            <DeltaBadge value={delta.total} />
          </span>
        </div>
        {providers.map((provider) => (
          <div key={provider} className="dk-admin-dashboard__enrichment-row">
            <span className="dk-admin-dashboard__enrichment-row-label">{PROVIDER_LABELS[provider] ?? provider}</span>
            <span className="dk-admin-dashboard__enrichment-row-value--plain">
              {counts[provider as keyof EnrichmentCounts]?.toLocaleString() ?? "0"}
              <DeltaBadge
                value={(delta[provider as keyof EnrichmentCounts] as number) ?? 0}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DeltaBadge({ value }: { value: number | null | undefined }) {
  if (!value) return null
  const sign = value > 0 ? "+" : ""
  return (
    <span
      className={cn(
        "dk-admin-dashboard__delta-badge",
        value > 0 ? "dk-admin-dashboard__delta-badge--positive" : "dk-admin-dashboard__delta-badge--negative",
      )}
    >
      {sign}
      {value.toLocaleString()}
    </span>
  )
}

const CHART_TYPES = ["movie", "show", "music", "game", "person"] as const

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="dk-admin-dashboard__stat-card">
      <p className="dk-admin-dashboard__stat-label">{label}</p>
      <p className="dk-admin-dashboard__stat-value">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="dk-admin-dashboard__skeleton">
      <div className="dk-admin-dashboard__skeleton-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="dk-admin-dashboard__skeleton-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function AdminDashboardPage() {
  const { user } = useAuth()

  if (!user?.isAdmin) {
    return <Navigate to="/" />
  }

  return (
    <div className="dk-admin-dashboard">
      <Helmet>
        <title>Admin - Otix</title>
      </Helmet>

      <AdminHeader />
      <AdminContent />
    </div>
  )
}

const CIRCLE_RADIUS = 13
const CIRCLE_VIEWBOX = 32
const CIRCLE_CENTER = CIRCLE_VIEWBOX / 2
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS

function AdminHeader() {
  const { isFetching, dataUpdatedAt, refetch } = useAdminStats()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let raf: number
    const loop = () => {
      setTick((t) => t + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const secondsSinceUpdate = useMemo(() => {
    return dataUpdatedAt != null ? (Date.now() - dataUpdatedAt) / 1000 : 0
  }, [dataUpdatedAt, tick])
  const progress = Math.min(1, secondsSinceUpdate / (REFETCH_INTERVAL / 1000))
  const secondsLeft = Math.max(0, Math.ceil(REFETCH_INTERVAL / 1000 - secondsSinceUpdate))

  const offset = isFetching ? 0 : CIRCUMFERENCE * (1 - progress)

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div className="dk-admin-dashboard__header">
      <h1 className="dk-admin-dashboard__title">Admin</h1>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isFetching}
        className="dk-admin-dashboard__refresh-btn"
        title={`Refreshes in ${secondsLeft}s`}
      >
        {/* Circular progress track */}
        <svg
          className="dk-admin-dashboard__refresh-progress"
          viewBox={`0 0 ${CIRCLE_VIEWBOX} ${CIRCLE_VIEWBOX}`}
        >
          <circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-white/[0.06]"
          />
          <circle
            cx={CIRCLE_CENTER}
            cy={CIRCLE_CENTER}
            r={CIRCLE_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="text-primary transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>

        {/* Icon + countdown */}
        <div className="dk-admin-dashboard__refresh-icon-wrap">
          <ArrowPathIcon
            className={cn(
              "dk-admin-dashboard__refresh-icon",
              isFetching && "dk-admin-dashboard__refresh-icon--spinning",
            )}
          />
          <span className="dk-admin-dashboard__refresh-countdown">
            {secondsLeft}
          </span>
        </div>
      </button>
    </div>
  )
}

const RANGE_OPTIONS = [
  { label: "10m", hours: 10 / 60 },
  { label: "30m", hours: 0.5 },
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "14d", hours: 336 },
  { label: "30d", hours: 720 },
  { label: "90d", hours: 2160 },
  { label: "1y", hours: 8760 },
] as const

function MetricChart({ metric, title, color, hours }: { metric: string; title: string; color: string; hours: number }) {
  const { data, isLoading } = useAdminMetrics(metric, hours)

  return (
    <div>
      <p className="dk-admin-dashboard__chart-title">{title}</p>
      {isLoading ? (
        <Skeleton className="h-[100px] rounded-2xl" />
      ) : (
        <LineChart data={data?.data ?? []} color={color} height={100} />
      )}
    </div>
  )
}

function AdminContent() {
  const { data, isLoading, isError } = useAdminStats()
  const [hours, setHours] = useState(10 / 60)

  if (isLoading) return <AdminSkeleton />
  if (isError || !data) {
    return (
      <div className="dk-admin-dashboard__error-state">
        <p className="dk-admin-dashboard__error-text">Failed to load stats.</p>
      </div>
    )
  }

  const mediaEntries = Object.entries(data.mediaCounts).sort(([, a], [, b]) => b - a)

  const chartSection = (type: "media" | "stubs") => (
    <div className="dk-admin-dashboard__grid--cols-2-4">
      {CHART_TYPES.map((mType) => (
        <MetricChart
          key={mType}
          metric={`${type}_${mType}`}
          title={MEDIA_LABELS[mType]}
          color="var(--primary)"
          hours={hours}
        />
      ))}
    </div>
  )

  return (
    <div className="dk-admin-dashboard__content">
      {/* Users */}
      <section>
        <h2 className="dk-admin-dashboard__section-title">Users</h2>
        <div className="dk-admin-dashboard__grid--cols-2-3">
          <StatCard label="Total Users" value={data.totalUsers} />
        </div>
      </section>

      {/* Range selector — shared across all metric charts */}
      <div className="dk-admin-dashboard__range-selector">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            type="button"
            onClick={() => setHours(opt.hours)}
            className={cn(
              "dk-admin-dashboard__range-btn",
              hours === opt.hours
                ? "dk-admin-dashboard__range-btn--active"
                : "",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Media counts */}
      <section>
        <h2 className="dk-admin-dashboard__section-title">Media</h2>
        <div className={cn("dk-admin-dashboard__grid--cols-2-4", "mb-6")}>
          {mediaEntries.length === 0 ? (
            <p className={cn("dk-admin-dashboard__empty-text", "dk-admin-dashboard__empty-text--col-span")}>No media yet.</p>
          ) : (
            mediaEntries.map(([type, count]) => (
              <StatCard key={type} label={MEDIA_LABELS[type] ?? type} value={count} />
            ))
          )}
        </div>

        {/* Enrichment breakdown */}
        {data.enrichment && (
          <div className="mb-6">
            <h3 className="dk-admin-dashboard__subsection-title">
              Enrichment
            </h3>
            <div className="dk-admin-dashboard__grid--cols-1-2-3">
              {Object.entries(data.enrichment).map(([type, counts]) => (
                <EnrichmentCard
                  key={type}
                  type={type}
                  counts={counts}
                  delta={data.deltas?.[type] ?? ({} as EnrichmentCounts)}
                />
              ))}
            </div>
          </div>
        )}

        {chartSection("media")}
      </section>

      {/* People */}
      <section>
        <h2 className="dk-admin-dashboard__section-title">People</h2>
        <div className={cn("dk-admin-dashboard__grid--cols-2-3", "mb-6")}>
          <StatCard label="Total People" value={data.peopleCount} />
        </div>
        <div className="dk-admin-dashboard__grid--cols-2-4">
          <MetricChart metric="media_person" title="People" color="var(--primary)" hours={hours} />
          <MetricChart metric="stubs_person" title="People Stubs" color="var(--primary)" hours={hours} />
        </div>
      </section>

      {/* Stub counts */}
      <section>
        <h2 className="dk-admin-dashboard__section-title">Stubs (unhydrated)</h2>
        <div className={cn("dk-admin-dashboard__grid--cols-2-3", "mb-6")}>
          <StatCard label="Total Stubs" value={data.stubCounts.total ?? 0} />
        </div>
        <MetricChart metric="stubs" title="All Stubs" color="var(--primary)" hours={hours} />
        <div className="mt-4">
          {chartSection("stubs")}
        </div>
      </section>

      {/* Recent users */}
      <section>
        <h2 className="dk-admin-dashboard__section-title">Recent Registrations</h2>
        {data.recentUsers.length === 0 ? (
          <p className="dk-admin-dashboard__empty-text">No users yet.</p>
        ) : (
          <div className="dk-admin-dashboard__table-wrapper">
            <table className="dk-admin-dashboard__table">
              <thead>
                <tr className="dk-admin-dashboard__table-header">
                  <th className="dk-admin-dashboard__table-header-cell">Username</th>
                  <th className="dk-admin-dashboard__table-header-cell--hidden-sm">Email</th>
                  <th className="dk-admin-dashboard__table-header-cell--hidden-sm">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recentUsers.map((u) => (
                  <tr key={u.id} className="dk-admin-dashboard__table-row">
                    <td className="dk-admin-dashboard__table-cell--bold">{u.username}</td>
                    <td className="dk-admin-dashboard__table-cell--muted-hidden-sm">{u.email}</td>
                    <td className="dk-admin-dashboard__table-cell--muted-hidden-sm">
                      {new Date(u.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
