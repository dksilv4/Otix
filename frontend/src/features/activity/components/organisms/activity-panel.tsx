import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { usePlayer } from '@/lib/player/use-player'
import { isDesktop } from '@/lib/desktop/api'
import { usePanelContext } from '@activity/providers/panel-context'
import { useAuth } from '@/lib/providers/auth'
import { useMatchedRunningGame } from '@/features/launcher'
import { useDownloads } from '@/features/downloads/use-downloads'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import { usePlexSessions } from '../../hooks/use-plex-sessions'
import { useNotifications } from '@/features/notifications/hooks/use-notifications'
import { notificationQueries } from '@/features/notifications/queries'
import { Feature } from '@/features/_config'

import { ActivityModuleGame } from '../molecules/activity-module-game'
import { ActivityModulePlayer } from '../molecules/activity-module-player'
import { ActivityModuleDownloads } from '../molecules/activity-module-downloads'
import { ActivityModuleInstalls } from '../molecules/activity-module-installs'
import { ActivityModulePlexSection } from '../molecules/activity-module-plex-section'
import { ActivityModuleNotifications } from '../molecules/activity-module-notifications'
import { ActivityModulePlugins } from '../molecules/activity-module-plugins'
import { ActivityModuleEmpty } from '../molecules/activity-module-empty'
import { staggerVariants } from '../molecules/activity-module-section'

const PANEL_WIDTH = 360
const PANEL_MARGIN = 16

export interface ActivityModuleProps {
  open: boolean
  onClose: () => void
}

/** Animated slide-in activity panel containing player, notifications, Plex, downloads, and games. */
export const ActivityModule = ({ open, onClose }: ActivityModuleProps) => {
  const { isUserMenuOpen } = usePanelContext()
  const { togglePlay, source, currentTrack } = usePlayer()
  const panelRef = useRef<HTMLDivElement>(null)
  const desktop = isDesktop()
  const { user: currentUser } = useAuth()

  // Live sources for activity status and category counts
  const { runningGame } = useMatchedRunningGame()
  const hasLocalPlayback = source !== 'none' && currentTrack !== null
  const { downloads } = useDownloads(currentUser?.id)
  const activeDownloads = downloads.filter(
    (d) => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing',
  )
  const { installs } = useInstallProgress()
  const activeInstalls = installs.filter((i) => i.active)
  const { sessions: plexSessions, isAdmin: isPlexAdmin } = usePlexSessions()
  const { allItems: notifications } = useNotifications()

  const { data: unreadData } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: !!currentUser,
  })
  const unreadCount = unreadData?.count ?? 0

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        void togglePlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, togglePlay, onClose])

  // Click outside handler
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-now-playing-trigger]')) return
      if (target.closest('[role="menu"]')) return
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  // Auto-scroll to top when panel opens
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = 0
    }
  }, [open])

  // Active status calculation
  const hasGame = Boolean(runningGame)
  const hasMusic = hasLocalPlayback
  const hasTransfers = activeDownloads.length > 0 || activeInstalls.length > 0
  const hasPlex = isPlexAdmin && plexSessions.length > 0
  const hasAlerts = unreadCount > 0

  const hasAnyActivity =
    hasGame || hasMusic || hasTransfers || hasPlex || hasAlerts || notifications.length > 0

  if (!open) return null

  const topOffset = desktop ? (isUserMenuOpen ? 236 : 100) : (isUserMenuOpen ? 208 : 72)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="activity-panel"
          ref={panelRef}
          key="activity-panel"
          initial={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))`,
            right: PANEL_MARGIN,
            top: topOffset,
            maxHeight: `calc(100vh - ${topOffset}px - ${PANEL_MARGIN}px)`,
            background: 'rgba(18, 19, 24, 0.94)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            zIndex: 9998,
          }}
          className="fixed flex flex-col rounded-3xl backdrop-blur-2xl will-change-transform overflow-hidden select-none"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.1, right: 0.8 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80 || info.velocity.x > 300) {
              onClose()
            }
          }}
        >
          {/* Scrollable body with custom scrollbar */}
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5 custom-scrollbar min-h-0">
            {!hasAnyActivity ? (
              <ActivityModuleEmpty onClose={onClose} />
            ) : (
              <motion.div
                variants={staggerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-2.5"
              >
                {/* Gaming module */}
                <ActivityModuleGame onClose={onClose} />

                {/* Music Player */}
                <ActivityModulePlayer />

                {/* Downloads & Installs */}
                <ActivityModuleDownloads />
                <ActivityModuleInstalls />

                {/* Plex Streaming (Admin-only) */}
                <Feature name="integration:plex">
                  <ActivityModulePlexSection onClose={onClose} />
                </Feature>

                {/* Plugin Activities */}
                <ActivityModulePlugins />

                {/* Notifications & Alerts */}
                <ActivityModuleNotifications onClose={onClose} />
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
};
