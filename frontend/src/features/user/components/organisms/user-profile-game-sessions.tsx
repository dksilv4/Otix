import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Gamepad2,
  Lock,
  ArrowRight,
} from 'lucide-react'
import { useUserGameSessions, type NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { partitionSessionsForShowcase } from '../../utils/game-activity-stats'
import { GameSessionCard } from '../molecules/game-session-card'
import { GameSessionIconTile } from '../molecules/game-session-icon-tile'
import { SessionDetailModal } from '../molecules/session-detail-modal'

interface UserProfileGameSessionsProps {
  username: string
}

export const UserProfileGameSessions = ({ username }: UserProfileGameSessionsProps) => {
  const { data, isLoading } = useUserGameSessions()
  const [selectedSession, setSelectedSession] = useState<NormalizedPlaySession | null>(null)

  const sessions = useMemo(() => data?.sessions || [], [data?.sessions])
  const activeSessions = useMemo(() => {
    if (data?.activeSessions && data.activeSessions.length > 0) {
      return data.activeSessions
    }
    return data?.activeSession ? [data.activeSession] : []
  }, [data?.activeSessions, data?.activeSession])

  const totalHours = data ? Math.floor(data.totalDurationSeconds / 3600) : 0

  const summaryParts: string[] = []
  if (!isLoading && data) {
    if (data.totalSessions > 0) {
      summaryParts.push(`${data.totalSessions} session${data.totalSessions !== 1 ? 's' : ''}`)
    }
    if (data.totalDurationSeconds > 0) {
      const timePlayed = totalHours > 0 ? `${totalHours}h` : `${Math.max(1, Math.round(data.totalDurationSeconds / 60))}m`
      summaryParts.push(`${timePlayed} played`)
    }
    if (data.overallAvgFps) {
      summaryParts.push(`${Math.round(data.overallAvgFps)} avg FPS`)
    }
  }

  // Segment sessions: support multiple active games & distinct featured games vs past games shelf
  const { featuredSessions, pastGames } = useMemo(
    () => partitionSessionsForShowcase(sessions, activeSessions.length),
    [sessions, activeSessions.length],
  )

  return (
    <div data-testid="user-profile-game-sessions" className="w-full space-y-4">
      {/* Header Bar with standard rail gutters */}
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Gamepad2 className="h-3.5 w-3.5 text-primary" />
            Game Sessions
          </span>
          {summaryParts.length > 0 && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-muted-foreground font-medium">
                {summaryParts.join(' · ')}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
            <Lock className="h-3 w-3 text-muted-foreground/50" />
            Private
          </span>

          <Link
            to="/u/$username/activity"
            params={{ username }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Empty State */}
      {sessions.length === 0 && activeSessions.length === 0 ? (
        <div className="mx-4 sm:mx-6 lg:px-8 py-10 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border/50 bg-card/30">
          <Gamepad2 size={32} className="text-muted-foreground/20 mb-2" />
          <h3 className="text-xs font-semibold text-muted-foreground mb-0.5">
            No sessions yet
          </h3>
          <p className="text-[11px] text-muted-foreground/60 max-w-xs">
            Launch games through Otix to automatically track your gaming sessions.
          </p>
        </div>
      ) : (
        /* Full-Width Grid: Featured Recent Cards + Compact Icon Shelf */
        <div className="space-y-4">
          {/* Featured Grid (Recent & Active Sessions) */}
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeSessions.map((session) => (
                <GameSessionCard
                  key={session.id}
                  session={session}
                  isLive
                  featured
                  onClick={() => setSelectedSession(session)}
                />
              ))}

              {featuredSessions.map((sess: NormalizedPlaySession, idx: number) => (
                <GameSessionCard
                  key={sess.id}
                  session={sess}
                  featured={activeSessions.length === 0 && idx === 0}
                  onClick={() => setSelectedSession(sess)}
                />
              ))}
            </div>
          </div>

          {/* Compact Icon Shelf for Remaining / Smaller Games */}
          {pastGames.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Past Games
                </span>
                <span className="text-[11px] text-muted-foreground/50">
                  {pastGames.length} {pastGames.length === 1 ? 'game' : 'games'}
                </span>
              </div>

              {/* Edge-to-edge horizontal icon track */}
              <div className="flex items-center gap-3 overflow-x-auto px-4 sm:px-6 lg:px-8 py-2 scrollbar-none">
                {pastGames.map((gameGroup) => (
                  <GameSessionIconTile
                    key={gameGroup.gameId || gameGroup.gameTitle}
                    session={gameGroup.latestSession}
                    totalPlaytimeSeconds={gameGroup.totalSeconds}
                    sessionCount={gameGroup.sessionCount}
                    onClick={() => setSelectedSession(gameGroup.latestSession)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Dossier Modal */}
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
