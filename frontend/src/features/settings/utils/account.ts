import { apiClient } from '@/lib/api/client'

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

export const fetchSessions = async (): Promise<SessionListData> => {
  const { data } = await apiClient.get('/auth/sessions')
  return data as SessionListData
}

export const revokeSession = async (sessionKey: string): Promise<void> => {
  await apiClient.delete(`/auth/sessions/${sessionKey}`)
}

export const revokeOtherSessions = async (): Promise<number> => {
  const { data } = await apiClient.delete('/auth/sessions')
  const msg = data.message as string
  const match = msg.match(/Revoked (\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

export { extractAccountErrorMessage } from '@/lib/utils/format-error'

export const formatUserAgent = (ua: string | null): string => {
  if (!ua) return 'Unknown device'
  const browsers = ['Firefox', 'Chrome', 'Safari', 'Edge', 'Opera']
  for (const b of browsers) {
    if (ua.includes(b)) {
      const match = ua.match(new RegExp(`${b}\\/([\\d.]+)`))
      return match ? `${b} ${match[1]}` : b
    }
  }
  return ua.length > 50 ? ua.slice(0, 50) + '…' : ua
}

export const formatSessionTime = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}
