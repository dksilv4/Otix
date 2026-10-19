import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/features/auth/hooks/use-auth'
import {
  useMatchedRunningGame,
  useGamingSessionXp,
  useCs2GameState,
  isCs2Game,
  formatCs2Status,
} from '@/features/launcher'
import { usePlexSessions } from '@/features/activity/hooks/use-plex-sessions'
import { usePlayer } from '@/lib/player/hooks/use-player'
import { Carousel } from '@ui/molecules/carousel'
import {
  DiscoverPlayerActivityCard,
  type LiveMediaActivityItem,
} from '../molecules/discover-player-activity-card'

/**
 * Standardised Live Activity Carousel in the Discover feed.
 * Aggregates any active media activity across games, movies, shows, and music.
 * Uses the project standard Carousel component and renders nothing when idle.
 */
export const DiscoverPlayerActivitySection = () => {
  const { user } = useAuth()
  const { runningGame, elapsedMs: gameElapsedMs, matchedGame } = useMatchedRunningGame()
  const { sessionXp } = useGamingSessionXp()
  const isCs2FromRunningGame = Boolean(
    runningGame &&
      isCs2Game(runningGame.game.title || runningGame.game.exePath || runningGame.game.processName),
  )
  const { gameState } = useCs2GameState({ enabled: isCs2FromRunningGame || !runningGame })
  const hasActiveCs2Gsi = Boolean(gameState && (gameState.isInGame || gameState.activity === 'playing'))
  const { sessions: plexSessions = [] } = usePlexSessions()
  const { isPlaying: isMusicPlaying, currentTrack, source: musicSource } = usePlayer()

  const items = useMemo<LiveMediaActivityItem[]>(() => {
    const list: LiveMediaActivityItem[] = []

    // 1. Active Gaming Session
    if ((runningGame || hasActiveCs2Gsi) && user) {
      const displayTitle = matchedGame?.title || runningGame?.game.title || 'Counter-Strike 2'
      const mediaId = matchedGame?.id || runningGame?.game.otixMediaId || null
      const gamePlatform = runningGame?.game.platform ? runningGame.game.platform.toUpperCase() : 'PC'
      const subtitle = matchedGame?.developer || gamePlatform
      const cs2Status = gameState ? formatCs2Status(gameState) : undefined

      list.push({
        id: runningGame
          ? `game-${runningGame.game.id}-${runningGame.startTime}`
          : `game-cs2-${gameState?.timestamp || 'active'}`,
        mediaType: 'game',
        mediaId,
        title: displayTitle,
        subtitle,
        user: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        posterUrl: matchedGame?.posterUrl || runningGame?.game.posterUrl,
        backdropUrl: matchedGame?.backdropUrl || runningGame?.game.backdropUrl,
        textlessPosterUrl: null,
        elapsedMs: gameElapsedMs,
        fps: runningGame?.fpsSnapshot?.currentFps ?? null,
        sessionXp,
        cs2Status,
      })
    }

    // 2. Active Watch Sessions (Plex / Streams)
    if (Array.isArray(plexSessions)) {
      plexSessions.forEach((sess, idx) => {
        if (!sess || sess.state === 'paused') return
        const isShow = sess.mediaType === 'episode' || Boolean(sess.grandparentTitle)
        const title = isShow ? (sess.grandparentTitle || sess.title) : sess.title
        const subtitle = isShow && sess.parentTitle ? `${sess.parentTitle} · ${sess.title}` : undefined

        list.push({
          id: `plex-${sess.sessionId || sess.ratingKey || idx}`,
          mediaType: isShow ? 'show' : 'movie',
          mediaId: sess.mediaItemId || sess.ratingKey,
          title,
          subtitle,
          user: {
            username: sess.userName || 'Viewer',
            avatarUrl: sess.userThumb || null,
          },
          posterUrl: sess.thumb,
          backdropUrl: sess.thumb,
          elapsedMs: sess.viewOffset || 0,
          durationMs: sess.duration || undefined,
        })
      })
    }

    // 3. Active Music Playback
    if (isMusicPlaying && currentTrack && user && musicSource !== 'none') {
      list.push({
        id: `music-${currentTrack.id}`,
        mediaType: 'music',
        mediaId: currentTrack.id,
        title: currentTrack.title,
        subtitle: currentTrack.artist || currentTrack.album,
        user: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        posterUrl: currentTrack.coverUrl,
        backdropUrl: currentTrack.coverUrl,
        elapsedMs: 0,
      })
    }

    return list
  }, [
    runningGame,
    hasActiveCs2Gsi,
    gameState,
    user,
    matchedGame,
    gameElapsedMs,
    sessionXp,
    plexSessions,
    isMusicPlaying,
    currentTrack,
    musicSource,
  ])

  if (items.length === 0) return null

  return (
    <motion.section
      id="discover-live-activity"
      data-testid="discover-player-activity-section"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <div className="px-8">
        <Carousel
          title="Live Activity"
          minItemWidth={260}
          gap={16}
          showArrows
        >
          {items.map((item) => (
            <DiscoverPlayerActivityCard key={item.id} item={item} />
          ))}
        </Carousel>
      </div>
    </motion.section>
  )
};
