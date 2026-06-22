import { useEffect, useRef } from 'react'
import { LayoutGrid } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayer } from '@/old-features/spotify/use-player'
import { isDesktop } from '@/lib/desktop/api'
import { Desktop } from '@/lib/desktop'
import { usePanelContext } from '@activity/providers/panel-context'
import { Feature } from '@/features/_config'
import { ActivityModuleGame } from '../molecules/activity-module-game'
import { ActivityModulePlayer } from '../molecules/activity-module-player'
import { ActivityModuleInstalls } from '../molecules/activity-module-installs'
import { ActivityModuleDownloads } from '../molecules/activity-module-downloads'
import { ActivityModulePlexSection } from '../molecules/activity-module-plex-section'
import { ActivityModuleNotifications } from '../molecules/activity-module-notifications'
import { ActivityModulePlugins } from '../molecules/activity-module-plugins'
import { ActivityModuleSection, staggerVariants } from '../molecules/activity-module-section'

const PANEL_WIDTH = 300
const PANEL_MARGIN = 16

export interface ActivityModuleProps {
  open: boolean
  onClose: () => void
}

/** Animated slide-in activity panel containing player, notifications, Plex, downloads, and games. */
export function ActivityModule({ open, onClose }: ActivityModuleProps) {
  const { isUserMenuOpen } = usePanelContext()
  const { togglePlay } = usePlayer()
  const panelRef = useRef<HTMLDivElement>(null)
  const desktop = isDesktop()

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        void togglePlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, togglePlay, onClose])

  // Auto-scroll to top when panel opens
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = 0
    }
  }, [open])

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="activity-panel"
          initial={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: PANEL_WIDTH + PANEL_MARGIN, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: PANEL_WIDTH,
            right: PANEL_MARGIN,
            top: desktop ? (isUserMenuOpen ? 236 : 100) : (isUserMenuOpen ? 208 : 72),
            maxHeight: desktop
              ? `calc(100vh - ${isUserMenuOpen ? 236 : 100}px - ${PANEL_MARGIN}px)`
              : `calc(100vh - ${isUserMenuOpen ? 208 : 72}px - ${PANEL_MARGIN}px)`,
            zIndex: 9998,
          }}
          className="fixed flex flex-col overflow-visible will-change-transform dk-surface"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.1, right: 0.8 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80 || info.velocity.x > 300) {
              onClose()
            }
          }}
        >
          <motion.div variants={staggerVariants} initial="hidden" animate="visible" className="flex flex-col gap-2">
            <ActivityModuleGame />
            <ActivityModulePlayer />
            <ActivityModuleInstalls />
            <Desktop><ActivityModuleDownloads /></Desktop>
            <Feature name="integration:plex"><ActivityModulePlexSection /></Feature>
            <ActivityModulePlugins />
            <ActivityModuleNotifications onClose={onClose} />
            <ActivityModuleSection>
              <div className="flex items-center justify-center py-3">
                <LayoutGrid className="h-5 w-5 text-white/[0.06]" />
              </div>
            </ActivityModuleSection>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
