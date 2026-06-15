import { motion } from 'framer-motion'
import type { PlexSession } from '../../types'
import { ActivityModulePlexCard } from '../molecules/activity-module-plex-card'

interface ActivityModulePlexListProps {
  sessions: PlexSession[]
}

/** Animated list of active Plex streaming sessions with per-session cards. */
export function ActivityModulePlexList({ sessions }: ActivityModulePlexListProps) {
  if (sessions.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground/50">
        No active sessions
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s, i) => (
        <motion.div
          key={s.session_id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
        >
          <ActivityModulePlexCard s={s} />
        </motion.div>
      ))}
    </div>
  )
}
