import { useState, useMemo } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import {
  ArrowLeft,
  Gamepad2,
  Clock,
  Gauge,
  Cpu,
  Lock,
  Search,
  SlidersHorizontal,
  Flame,
  Radio,
  Server,
} from 'lucide-react'
import { useUserGameSessions, type NormalizedPlaySession } from '../hooks/use-user-game-sessions'
import {
  computeFavoriteGame,
  computeTopHardware,
  computeSessionStats,
  filterAndSortSessions,
  formatHours,
  formatLiveElapsed,
  type SessionSortOption,
} from '../utils/game-activity-stats'
import { humanPlaytime, fullDateTime } from '../utils'
import { SessionDetailModal } from '../components/molecules/session-detail-modal'

export const UserGameActivityPage = () => {
  const { username } = useParams({ strict: false }) as { username?: string }
  const displayUsername = username || 'User'

  const { data } = useUserGameSessions({ username })
  const [selectedSession, setSelectedSession] = useState<NormalizedPlaySession | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SessionSortOption>('recent')
  const [nodeFilter, setNodeFilter] = useState('all')
  const [gameFilter, setGameFilter] = useState('all')

  const sessions = useMemo(() => data?.sessions || [], [data?.sessions])
  const activeSessions = useMemo(() => {
    if (data?.activeSessions && data.activeSessions.length > 0) {
      return data.activeSessions
    }
    return data?.activeSession ? [data.activeSession] : []
  }, [data?.activeSessions, data?.activeSession])

  const stats = useMemo(() => computeSessionStats(sessions), [sessions])
  const favoriteGame = useMemo(() => computeFavoriteGame(sessions), [sessions])
  const topHardware = useMemo(() => computeTopHardware(sessions), [sessions])

  // Available node names for filtering
  const availableNodes = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach((s) => {
      if (s.node?.name) set.add(s.node.name)
    })
    return Array.from(set)
  }, [sessions])

  // Available game titles for filtering
  const availableGames = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach((s) => {
      if (s.gameTitle) set.add(s.gameTitle)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [sessions])

  const filteredSessions = useMemo(
    () =>
      filterAndSortSessions(sessions, {
        search,
        sortBy,
        nodeFilter,
        gameFilter,
      }),
    [sessions, search, sortBy, nodeFilter, gameFilter],
  )

  return (
    <div
      id="user-game-activity-page"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-16 w-full flex flex-col space-y-8"
    >
      <Helmet>
        <title>{`${displayUsername}'s Gaming Activity - Otix`}</title>
        <meta
          name="description"
          content={`Explore ${displayUsername}'s gaming sessions, performance telemetry, and play statistics.`}
        />
      </Helmet>

      {/* ── Navigation & Page Header ── */}
      <div className="flex flex-col gap-3">
        <Link
          to="/u/$username"
          params={{ username: displayUsername }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to {displayUsername}&apos;s profile</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-1">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2.5">
                <Gamepad2 className="h-7 w-7 text-primary" />
                Game Activity & Telemetry
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary/80 text-[11px] font-medium text-muted-foreground border border-border/40">
                <Lock className="h-3 w-3 text-muted-foreground/60" />
                Private
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Complete play session history, telemetry benchmarks, and gaming analytics.
            </p>
          </div>
        </div>
      </div>

      {/* ── Active Session Spotlight (If Games are Running) ── */}
      {activeSessions.length > 0 && (
        <div className="space-y-4">
          {activeSessions.map((activeSess) => (
            <div
              key={activeSess.id}
              data-testid="activity-page-active-banner"
              className="relative overflow-hidden rounded-2xl border border-primary/50 bg-card p-5 sm:p-6 shadow-lg shadow-primary/5"
            >
              {(activeSess.backdropUrl || activeSess.bannerUrl || activeSess.posterUrl) && (
                <img
                  src={(activeSess.backdropUrl || activeSess.bannerUrl || activeSess.posterUrl)!}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-card/95 via-card/80 to-card/25 pointer-events-none" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted/40 border border-primary/40 shrink-0 flex items-center justify-center">
                    {activeSess.posterUrl ? (
                      <img
                        src={activeSess.posterUrl}
                        alt={activeSess.gameTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Gamepad2 size={28} className="text-primary" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 text-[10px] font-bold uppercase tracking-wider">
                        <Radio className="h-3 w-3 animate-pulse" />
                        Live Now
                      </span>
                      {activeSess.node?.name && (
                        <span className="text-xs text-muted-foreground font-mono">
                          on {activeSess.node.name}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      {activeSess.gameTitle}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Elapsed: {formatLiveElapsed(activeSess.durationSeconds)}
                      {activeSess.hardwareSummary ? ` · ${activeSess.hardwareSummary}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {activeSess.avgFps && (
                    <div className="px-4 py-2 rounded-xl bg-secondary/80 border border-border/40 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Live FPS
                      </span>
                      <span className="text-2xl font-black font-mono text-primary tabular-nums">
                        {Math.round(activeSess.avgFps)}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedSession(activeSess)}
                    className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    View Live Dossier
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Key Analytics Dashboard Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Playtime Card */}
        <div className="p-5 rounded-2xl border border-border/60 bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Playtime
            </span>
            <Clock size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-foreground font-mono tabular-nums">
              {formatHours(stats.totalDurationSeconds)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Across {stats.totalSessions} play session{stats.totalSessions !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Favorite Game Card */}
        <div className="p-5 rounded-2xl border border-border/60 bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Favorite Game
            </span>
            <Gamepad2 size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-lg sm:text-xl font-bold text-foreground truncate">
              {favoriteGame?.title ?? 'None recorded'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {favoriteGame
                ? `${formatHours(favoriteGame.totalSeconds)} · ${favoriteGame.sessionCount} sessions`
                : 'Play games to track favorites'}
            </p>
          </div>
        </div>

        {/* Average Performance Card */}
        <div className="p-5 rounded-2xl border border-border/60 bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Average Performance
            </span>
            <Gauge size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-foreground font-mono tabular-nums">
              {stats.overallAvgFps ? `${Math.round(stats.overallAvgFps)} FPS` : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.overallAvgLow1
                ? `1% Low: ${Math.round(stats.overallAvgLow1)} FPS avg`
                : stats.totalFrames
                  ? `${stats.totalFrames.toLocaleString()} frames rendered`
                  : 'Telemetry benchmark'}
            </p>
          </div>
        </div>

        {/* Primary Rig Card */}
        <div className="p-5 rounded-2xl border border-border/60 bg-card shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Primary Battlestation
            </span>
            <Cpu size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-base sm:text-lg font-bold text-foreground truncate">
              {topHardware?.hardwareSummary || topHardware?.nodeName || 'Desktop Rig'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {topHardware
                ? `${topHardware.sessionCount} sessions logged`
                : 'Local hardware logging'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Session History & Exploration ── */}
      <div className="space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-border/40">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Session History
            </h2>
            <p className="text-xs text-muted-foreground">
              Showing {filteredSessions.length} of {sessions.length} recorded session{sessions.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search games..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-secondary/40 border border-border/60 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Game Filter (if multiple games recorded) */}
            {availableGames.length > 1 && (
              <select
                value={gameFilter}
                onChange={(e) => setGameFilter(e.target.value)}
                aria-label="Filter by Game"
                className="px-3 py-1.5 rounded-xl bg-secondary/40 border border-border/60 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">All Games ({availableGames.length})</option>
                {availableGames.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}

            {/* Node Filter (if multiple nodes) */}
            {availableNodes.length > 1 && (
              <select
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-secondary/40 border border-border/60 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Devices</option>
                {availableNodes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-secondary/40 border border-border/60 rounded-xl px-2.5 py-1.5 text-xs text-foreground">
              <SlidersHorizontal className="h-3 w-3 text-muted-foreground mr-1" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SessionSortOption)}
                className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
              >
                <option value="recent">Most Recent</option>
                <option value="duration">Longest Duration</option>
                <option value="fps">Highest FPS</option>
                <option value="title">Game Title</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border/60 bg-card/20">
            <Gamepad2 size={36} className="text-muted-foreground/30 mb-2" />
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {sessions.length === 0 ? 'No gaming sessions recorded yet' : 'No sessions match your search'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {sessions.length === 0
                ? 'Launch games using the Otix desktop launcher to automatically capture performance metrics, FPS stats, and play history.'
                : 'Try adjusting your search query or device filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSession(session)}
                className="group p-3.5 rounded-2xl border border-border/60 hover:border-primary/50 bg-card hover:bg-card/90 shadow-sm transition-all duration-200 text-left cursor-pointer flex items-start gap-3.5"
              >
                {/* Poster / Thumbnail */}
                <div className="w-14 h-20 rounded-xl overflow-hidden bg-muted/40 border border-border/50 shrink-0 relative flex items-center justify-center">
                  {session.posterUrl ? (
                    <img
                      src={session.posterUrl}
                      alt={session.gameTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <Gamepad2 size={24} className="text-muted-foreground/40" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-20 py-0.5">
                  <div>
                    <h4 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {session.gameTitle}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {fullDateTime(session.startTime)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/80 text-[10px] font-medium text-secondary-foreground border border-border/30">
                      <Clock size={10} className="text-muted-foreground" />
                      {humanPlaytime(session.durationSeconds)}
                    </span>

                    {session.avgFps ? (
                      <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full bg-secondary/80 text-[10px] font-mono font-bold text-foreground border border-border/30">
                        <Gauge size={10} className="text-primary self-center mr-0.5" />
                        {Math.round(session.avgFps)} FPS
                      </span>
                    ) : null}

                    {session.low1Percent ? (
                      <span className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-secondary/50 text-[9px] font-mono text-muted-foreground border border-border/20">
                        <Flame size={9} className="text-muted-foreground/80" />
                        {Math.round(session.low1Percent)} 1%
                      </span>
                    ) : null}

                    {session.node?.name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/50 text-[9px] font-mono text-muted-foreground border border-border/20 truncate max-w-[100px]">
                        <Server size={9} className="text-muted-foreground/60" />
                        {session.node.name}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Dossier Modal ── */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          open={!!selectedSession}
          onOpenChange={(open) => {
            if (!open) setSelectedSession(null)
          }}
        />
      )}
    </div>
  )
};
