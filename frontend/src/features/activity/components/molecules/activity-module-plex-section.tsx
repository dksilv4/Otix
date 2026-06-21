import { usePlexSessions } from '../../hooks/use-plex-sessions'
import { ActivityModulePlexList } from '../organisms/activity-module-plex-list'
import { ActivityModuleSection } from './activity-module-section'

/** Inline Plex streaming section showing active sessions for the activity panel. */
export function ActivityModulePlexSection() {
  const { data: plexSessions = [] } = usePlexSessions()

  if (plexSessions.length === 0) return null

  return (
    <ActivityModuleSection>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-[#e5a00d]" />
        <span className="text-xs font-semibold text-muted-foreground">
          Plex &middot; {plexSessions.length} streaming
        </span>
      </div>
      <ActivityModulePlexList sessions={plexSessions} />
    </ActivityModuleSection>
  )
}
