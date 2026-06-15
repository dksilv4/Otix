import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/providers/auth'
import { useFeature } from '@/features/_config'
import { PlexSessionList } from '../organisms/activity-module-plex'
import type { PlexSession } from '../organisms/activity-module-plex'
import { ActivityModuleSection } from './activity-module-section'

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

/** Inline Plex streaming section showing active sessions for the activity panel. */
export function ActivityModulePlexSection() {
  const { user: currentUser } = useAuth()
  const plexEnabled = useFeature('integration:plex')

  const { data: plexSessions = [] } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: plexEnabled && !!currentUser?.plexId,
  })

  if (plexSessions.length === 0) return null

  return (
    <ActivityModuleSection>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-[#e5a00d]" />
        <span className="text-xs font-semibold text-muted-foreground">
          Plex &middot; {plexSessions.length} streaming
        </span>
      </div>
      <PlexSessionList sessions={plexSessions} />
    </ActivityModuleSection>
  )
}
