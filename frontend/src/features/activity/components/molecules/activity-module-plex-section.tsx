import { usePlexSessions } from '../../hooks/use-plex-sessions'
import { ActivityModulePlexList } from '../organisms/activity-module-plex-list'
import { ActivityModuleSection } from './activity-module-section'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'

interface ActivityModulePlexSectionProps {
  onClose?: () => void
}

/** Inline Plex streaming section showing active sessions for the activity panel (admin-only). */
export const ActivityModulePlexSection = ({ onClose }: ActivityModulePlexSectionProps = {}) => {
  const { sessions: plexSessions, isAdmin } = usePlexSessions()

  // Only show if the user is the admin (owner) of the server and there are active sessions
  if (!isAdmin || plexSessions.length === 0) return null

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e5a00d]/15">
            <PlexIcon className="h-3 w-3 text-[#e5a00d]" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Plex Streams
          </span>
          <span className="rounded-full bg-[#e5a00d]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#e5a00d] tabular-nums">
            {plexSessions.length} active
          </span>
        </div>
      </div>
      <ActivityModulePlexList sessions={plexSessions} onClose={onClose} />
    </ActivityModuleSection>
  )
};
