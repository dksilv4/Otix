import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { X, Sparkles, Gamepad2, Music, Download, Bell } from 'lucide-react'
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
import PlexIcon from '@/assets/provider-logos/plex.svg?react'

import { ActivityModuleGame } from '../molecules/activity-module-game'
import { ActivityModulePlayer } from '../molecules/activity-module-player'
import { ActivityModuleDownloads } from '../molecules/activity-module-downloads'
import { ActivityModuleInstalls } from '../molecules/activity-module-installs'
import { ActivityModulePlexSection } from '../molecules/activity-module-plex-section'
import { ActivityModuleNotifications } from '../molecules/activity-module-notifications'
import { ActivityModulePlugins } from '../molecules/activity-module-plugins'
import { ActivityModuleEmpty } from '../molecules/activity-module-empty'
import { staggerVariants } from '../molecules/activity-module-section'
import type { ActivityCategory } from '../../types'

const PANEL_WIDTH = 360
const PANEL_MARGIN = 16

export interface ActivityModuleProps {
  open: boolean
  onClose: () => void
}

/** Animated slide-in activity panel containing player, notifications, Plex, downloads, and games. */
export function ActivityModule({ open, onClose }: ActivityModuleProps) {
  const { isUserMenuOpen } = usePanelContext()
  const { togglePlay, source, currentTrack } = usePlayer()
  const panelRef = useRef<HTMLDivElement>(null)
  const desktop = isDesktop()
  const { user: currentUser } = useAuth()

  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory>('all')

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

  const totalActiveCount =
    (hasGame ? 1 : 0) +
    (hasMusic ? 1 : 0) +
    activeDownloads.length +
    activeInstalls.length +
    (hasPlex ? plexSessions.length : 0) +
    (hasAlerts ? 1 : 0)

  const hasAnyActivity =
    hasGame || hasMusic || hasTransfers || hasPlex || hasAlerts || notifications.length > 0

  // Categories with activity for filter tabs
  const availableCategories = useMemo(() => {
    const categories: Array<{ id: ActivityCategory; label: string; icon: any; count?: number }> = [
      { id: 'all', label: 'All', icon: Sparkles, count: totalActiveCount },
    ]
    const mediaCount =
      (hasGame ? 1 : 0) + (hasMusic ? 1 : 0) + (hasPlex ? plexSessions.length : 0)
    if (hasGame || hasMusic || hasPlex) {
      categories.push({
        id: 'media',
        label: 'Media',
        icon: hasPlex && !hasGame && !hasMusic ? PlexIcon : hasGame ? Gamepad2 : Music,
        count: mediaCount,
      })
    }
    if (hasTransfers) {
      categories.push({
        id: 'transfers',
        label: 'Transfers',
        icon: Download,
        count: activeDownloads.length + activeInstalls.length,
      })
    }
    if (notifications.length > 0) {
      categories.push({
        id: 'notifications',
        label: 'Alerts',
        icon: Bell,
        count: unreadCount > 0 ? unreadCount : undefined,
      })
    }
    return categories
  }, [hasGame, hasMusic, hasTransfers, hasPlex, totalActiveCount, activeDownloads.length, activeInstalls.length, plexSessions.length, notifications.length, unreadCount])

  // If the active filter tab no longer has items, revert to 'all'
  useEffect(() => {
    if (selectedCategory !== 'all' && !availableCategories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory('all')
    }
  }, [availableCategories, selectedCategory])

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
            boxShadow:
              '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
            zIndex: 9998,
          }}
          className="fixed flex flex-col rounded-3xl border border-white/10 backdrop-blur-2xl will-change-transform overflow-hidden select-none"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.1, right: 0.8 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80 || info.velocity.x > 300) {
              onClose()
            }
          }}
        >
          {/* Header */}
          <div className="flex flex-col px-4 pt-3.5 pb-2.5 border-b border-white/[0.06] shrink-0 bg-white/[0.015]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  {totalActiveCount > 0 ? (
                    <>
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white/30" />
                  )}
                </span>
                <h2 className="text-sm font-bold tracking-tight text-white/95">Activity</h2>
                {totalActiveCount > 0 && (
                  <span className="rounded-full bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-white/70 tabular-nums">
                    {totalActiveCount} active
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filter Pills when multiple categories exist */}
            {availableCategories.length > 2 && (
              <div className="flex items-center gap-1 mt-2.5 overflow-x-auto no-scrollbar py-0.5">
                {availableCategories.map((cat) => {
                  const Icon = cat.icon
                  const isSelected = selectedCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all shrink-0 cursor-pointer ' +
                        (isSelected
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08]')
                      }
                    >
                      <Icon className="h-3 w-3" />
                      <span>{cat.label}</span>
                      {cat.count != null && cat.count > 0 && (
                        <span
                          className={
                            'text-[9px] font-mono tabular-nums px-1 rounded-full ' +
                            (isSelected ? 'bg-black/10 text-black' : 'bg-white/10 text-white/70')
                          }
                        >
                          {cat.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Scrollable body with custom scrollbar */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 custom-scrollbar min-h-0">
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
                {(selectedCategory === 'all' || selectedCategory === 'media') && (
                  <ActivityModuleGame onClose={onClose} />
                )}

                {/* Music Player */}
                {(selectedCategory === 'all' || selectedCategory === 'media') && (
                  <ActivityModulePlayer />
                )}

                {/* Downloads & Installs */}
                {(selectedCategory === 'all' || selectedCategory === 'transfers') && (
                  <>
                    <ActivityModuleDownloads />
                    <ActivityModuleInstalls />
                  </>
                )}

                {/* Plex Streaming (Admin-only) */}
                {(selectedCategory === 'all' || selectedCategory === 'media' || selectedCategory === 'plex') && (
                  <Feature name="integration:plex">
                    <ActivityModulePlexSection onClose={onClose} />
                  </Feature>
                )}

                {/* Plugin Activities */}
                {selectedCategory === 'all' && <ActivityModulePlugins />}

                {/* Notifications & Alerts */}
                {(selectedCategory === 'all' || selectedCategory === 'notifications') && (
                  <ActivityModuleNotifications onClose={onClose} />
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
