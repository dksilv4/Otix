import { apiClient } from '@/lib/api/client'
import { isDesktop } from '@/lib/desktop/api'
import { getDesktopPlatform } from '@/lib/desktop/platform'

const DEVICE_ID_KEY = 'otix:device-id'

export interface PendingUpdateEntry {
  id: string
  type: string
  data: any
  createdAt?: string
}

export interface DeviceHeartbeatResponse {
  id?: number
  name?: string
  isOnline?: boolean
  pendingUpdates?: PendingUpdateEntry[]
  [key: string]: unknown
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown-device'
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'temp-device'
  }
}

export function getClientDeviceName(): string {
  if (typeof window === 'undefined') return 'Otix Client'
  if (isDesktop()) {
    const platform = getDesktopPlatform().platform
    if (platform === 'darwin') return 'This Mac'
    if (platform === 'win32') return 'This PC'
    return 'This Computer'
  }

  // Browser client
  const ua = navigator.userAgent
  let browser = 'Browser'
  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'

  let os = 'Device'
  if (ua.includes('Win')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  return `${browser} on ${os}`
}

export async function registerDeviceSession(isOnline = true): Promise<DeviceHeartbeatResponse | null> {
  try {
    const deviceId = getOrCreateDeviceId()
    const name = getClientDeviceName()
    const { data } = await apiClient.post<DeviceHeartbeatResponse>('/library/nodes/desktop-heartbeat', {
      device_id: deviceId,
      name,
      is_online: isOnline,
    })
    return data
  } catch {
    return null
  }
}

export async function fetchDevicePendingUpdates(nodeId: number): Promise<PendingUpdateEntry[]> {
  try {
    const { data } = await apiClient.get<{ pendingUpdates?: PendingUpdateEntry[] }>(
      `/library/servers/${nodeId}/pending-updates`,
    )
    return data.pendingUpdates || []
  } catch {
    return []
  }
}

export async function acknowledgeDeviceUpdates(nodeId: number, updateIds?: string[]): Promise<boolean> {
  try {
    await apiClient.post(`/library/servers/${nodeId}/acknowledge-updates`, {
      update_ids: updateIds,
    })
    return true
  } catch {
    return false
  }
}
