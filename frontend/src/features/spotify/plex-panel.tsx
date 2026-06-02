import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { PlexSessionList } from './plex-now-playing'
import type { PlexSession } from './plex-now-playing'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

export function PlexPanel() {
  const [dismissed, setDismissed] = useState(false)
  const { user: currentUser } = useAuth()

  const { data: plexSessions = [] } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/auth/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: !!currentUser?.plexId,
  })

  if (plexSessions.length === 0 || dismissed) return null

  return (
    <div
      className={cn(
        'rounded-xl bg-white/[0.04] p-3',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#e5a00d]" />
          <span className="text-xs font-semibold text-muted-foreground">
            Plex &middot; {plexSessions.length} streaming
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.08] transition-colors"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <PlexSessionList sessions={plexSessions} />
    </div>
  )
}
