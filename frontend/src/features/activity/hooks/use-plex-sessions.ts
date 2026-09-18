import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/providers/auth'
import { useFeature } from '@/features/_config'
import type { PlexSessionsResponse } from '../types'

/** Custom hook to fetch active Plex sessions. */
export function usePlexSessions() {
  const { user: currentUser } = useAuth()
  const plexEnabled = useFeature('integration:plex')

  return useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: plexEnabled && !!currentUser?.plexId,
    meta: { suppressToast: true },
  })
}
