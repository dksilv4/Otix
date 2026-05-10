import { apiClient } from '@/lib/api-client'

export interface SessionInfo {
  sessionKey: string
  ipAddress: string | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string | null
}

export interface SessionListData {
  sessions: SessionInfo[]
  currentSessionKey: string | null
}

export async function fetchSessions(): Promise<SessionListData> {
  const { data } = await apiClient.get('/auth/sessions')
  return data as SessionListData
}

export async function revokeSession(sessionKey: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${sessionKey}`)
}

export async function revokeOtherSessions(): Promise<number> {
  const { data } = await apiClient.delete('/auth/sessions')
  const msg = data.message as string
  const match = msg.match(/Revoked (\d+)/)
  return match ? parseInt(match[1], 10) : 0
}
