import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/features/auth/hooks/use-auth'
import { useMatchedRunningGame, useGamingSessionXp } from '@/features/launcher'
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
  const { sessions: plexSessions = [] } = usePlexSessions()
  const { isPlaying: isMusicPlaying, currentTrack, source: musicSource } = usePlayer()

  const items = useMemo<LiveMediaActivityItem[]>(() => {
    const list: LiveMediaActivityItem[] = []

    // 1. Active Gaming Session
    if (runningGame && user) {
      const displayTitle = matchedGame?.title || runningGame.game.title
      const mediaId = matchedGame?.id || (runningGame.game.otixMediaId ? runningGame.game.otixMediaId : null)

      list.push({
        id: `game-${runningGame.game.id}-${runningGame.startTime}`,
        mediaType: 'game',
        mediaId,
        title: displayTitle,
        subtitle: matchedGame?.developer || runningGame.game.platform.toUpperCase(),
        user: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        posterUrl: matchedGame?.posterUrl || runningGame.game.posterUrl,
        backdropUrl: matchedGame?.backdropUrl || runningGame.game.backdropUrl,
        textlessPosterUrl: null,
        elapsedMs: gameElapsedMs,
        fps: runningGame.fpsSnapshot?.currentFps ?? null,
        sessionXp,
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
