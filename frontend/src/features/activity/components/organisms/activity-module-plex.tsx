import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { useFeature } from '@/features/_config'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { usePlexSessions } from '../../hooks/use-plex-sessions'
import { ActivityModulePlexList } from './activity-module-plex-list'

/** Standalone Plex activity toggle pill with a popover showing active streaming sessions. */
export const ActivityModulePlex = () => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isDesktop } = useDesktopPlatform()
  const plexEnabled = useFeature('integration:plex')
  
  const { data: sessions = [] } = usePlexSessions()
  const count = sessions.length

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-plex-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  if (!plexEnabled) return null
  if (count === 0 && !open) return null

  return (
    <>
      <button
        type="button"
        data-plex-trigger
        onClick={() => setOpen(!open)}
        className={'flex items-center p-1.5 relative cursor-pointer rounded-[2rem] backdrop-blur-[16px]' + (count > 0 ? ' shadow-[0_0_0_1px_rgba(229,160,13,0.4)]' : '')}
        style={{
          background: 'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: count > 0
            ? 'var(--dk-shadow-glass), 0 0 0 1px rgba(229,160,13,0.4)'
            : 'var(--dk-shadow-glass)',
        }}
        aria-label="Plex now playing"
      >
        <PlexIcon className={'h-5 w-5' + (count > 0 ? ' text-[#e5a00d]' : ' text-muted-foreground')} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold leading-none text-[10px] text-black bg-[#e5a00d]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={'fixed right-4 z-[9999] w-80 max-h-[32rem] overflow-y-auto p-3 flex flex-col gap-2 rounded-[1.5rem]' + (isDesktop ? ' top-[110px]' : ' top-18')}
            style={{
              background: 'var(--dk-surface-overlay)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: 'var(--dk-shadow-glass)',
            }}
          >
            <ActivityModulePlexList sessions={sessions} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
};
export { ActivityModulePlexList }
export type { PlexSession } from '../../types'
