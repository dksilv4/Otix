// TODO: Review this file
import { useState, useEffect, useCallback } from "react"
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
    <div
      className={cn(
        "rounded-2xl p-4",
        "bg-[var(--dk-surface-glass)] backdrop-blur-xl",
        "shadow-[var(--dk-shadow-glass)]",
      )}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono tabular-nums font-medium">
            {counts.total.toLocaleString()}
            <DeltaBadge value={delta.total} />
          </span>
        </div>
        {providers.map((provider) => (
          <div key={provider} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{PROVIDER_LABELS[provider] ?? provider}</span>
            <span className="font-mono tabular-nums">
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
        "ml-1.5 text-[11px] font-medium",
        value > 0 ? "text-emerald-400" : "text-red-400",
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
    <div
      className={cn(
        "rounded-2xl p-5",
        "bg-[var(--dk-surface-glass)] backdrop-blur-xl",
        "shadow-[var(--dk-shadow-glass)]",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight font-mono">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
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
    <div className="mx-auto lg:max-w-4xl pb-16">
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
  const [, setTick] = useState(0)

  useEffect(() => {
    let raf: number
    const loop = () => {
      setTick((t) => t + 1)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const secondsSinceUpdate = dataUpdatedAt != null
    ? (Date.now() - dataUpdatedAt) / 1000
    : 0
  const progress = Math.min(1, secondsSinceUpdate / (REFETCH_INTERVAL / 1000))
  const secondsLeft = Math.max(0, Math.ceil(REFETCH_INTERVAL / 1000 - secondsSinceUpdate))

  const offset = isFetching ? 0 : CIRCUMFERENCE * (1 - progress)

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-2xl font-extrabold tracking-tight">Admin</h1>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isFetching}
        className={cn(
          "group relative flex items-center justify-center",
          "w-10 h-10 rounded-full",
          "bg-[var(--dk-surface-glass)] backdrop-blur-xl",
          "shadow-[var(--dk-shadow-glass)]",
          "hover:bg-[var(--dk-surface-glass-hover)]",
          "transition-all disabled:cursor-default",
        )}
        title={`Refreshes in ${secondsLeft}s`}
      >
        {/* Circular progress track */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
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
        <div className="relative flex flex-col items-center">
          <ArrowPathIcon
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors",
              isFetching && "animate-spin text-primary",
            )}
          />
          <span className="text-[9px] font-semibold text-muted-foreground tabular-nums leading-none mt-0.5">
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
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>
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
      <div className="flex min-h-[30vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load stats.</p>
      </div>
    )
  }

  const mediaEntries = Object.entries(data.mediaCounts).sort(([, a], [, b]) => b - a)

  const chartSection = (type: "media" | "stubs") => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
    <div className="space-y-10">
      {/* Users */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Users</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Total Users" value={data.totalUsers} />
        </div>
      </section>

      {/* Range selector — shared across all metric charts */}
      <div className="flex items-center gap-1 flex-wrap">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            type="button"
            onClick={() => setHours(opt.hours)}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors",
              hours === opt.hours
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Media counts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Media</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          {mediaEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full">No media yet.</p>
          ) : (
            mediaEntries.map(([type, count]) => (
              <StatCard key={type} label={MEDIA_LABELS[type] ?? type} value={count} />
            ))
          )}
        </div>

        {/* Enrichment breakdown */}
        {data.enrichment && (
          <div className="mb-6">
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Enrichment
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">People</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-6">
          <StatCard label="Total People" value={data.peopleCount} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricChart metric="media_person" title="People" color="var(--primary)" hours={hours} />
          <MetricChart metric="stubs_person" title="People Stubs" color="var(--primary)" hours={hours} />
        </div>
      </section>

      {/* Stub counts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Stubs (unhydrated)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-6">
          <StatCard label="Total Stubs" value={data.stubCounts.total ?? 0} />
        </div>
        <MetricChart metric="stubs" title="All Stubs" color="var(--primary)" hours={hours} />
        <div className="mt-4">
          {chartSection("stubs")}
        </div>
      </section>

      {/* Recent users */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Registrations</h2>
        {data.recentUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-5 py-3 font-medium hidden sm:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 font-medium">{u.username}</td>
                    <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                    <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">
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
