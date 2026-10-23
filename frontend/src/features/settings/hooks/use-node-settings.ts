import { apiClient } from '@/lib/api/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { serverKeys } from '@/features/downloads/use-server-downloads'
import { getDesktopAPI } from '@/lib/desktop/api'
import { isLocalDesktopNodeId } from '../local-desktop-node'

export type NodeScanPath = { path: string; type: 'game' | 'iso' }

export interface NodeLibraryFolder {
  name: string
  path: string
  kind: 'game' | 'iso'
}

export interface NodeOrganizeSettings {
  postProcessEnabled: boolean
  autoSearchWishlist: boolean
  wishlistIntervalHours: number
  preferredRepackers: string
  allowHypervisor: boolean
  autoOrganizeEnabled: boolean
  namingTemplate: string
  isoDownloadPath: string
  scanOnLaunch: boolean
  gamesDownloadPath: string
  gamesInstallPath?: string
}

function nodeSettingsKeys(serverId: number) {
  return {
    libraries: [...serverKeys.all, serverId, 'libraries'] as const,
    organize: [...serverKeys.all, serverId, 'organize'] as const,
  }
}

function asFolder(row: Record<string, unknown>): NodeLibraryFolder | null {
  const path = String(row.path || '').trim()
  if (!path) return null
  const kind = row.kind === 'iso' || row.type === 'iso' ? 'iso' : 'game'
  return {
    name: String(row.name || path),
    path,
    kind,
  }
}

export function mapLibrariesToScanPaths(rows: unknown): NodeScanPath[] {
  const list = Array.isArray(rows) ? rows : (rows as { libraries?: unknown[] })?.libraries || []
  return list
    .map((row) => asFolder((row || {}) as Record<string, unknown>))
    .filter((row): row is NodeLibraryFolder => Boolean(row))
    .map((row) => ({ path: row.path, type: row.kind }))
}

export function useNodeLibraries(serverId: number | null | undefined) {
  return useQuery({
    queryKey: serverId ? nodeSettingsKeys(serverId).libraries : ['game-servers', 'libraries', 'idle'],
    enabled: Boolean(serverId),
    queryFn: async () => {
      if (isLocalDesktopNodeId(serverId)) {
        const api = getDesktopAPI()
        if (api?.getScanPaths) {
          try {
            const raw = await api.getScanPaths()
            if (Array.isArray(raw)) {
              return raw
                .map((item: any) => ({
                  path: String(item.path || ''),
                  type: item.type === 'iso' ? ('iso' as const) : ('game' as const),
                }))
                .filter((i) => i.path)
            }
          } catch {
            // ignore
          }
        }
        return []
      }
      const { data } = await apiClient.get(`/library/servers/${serverId}/libraries`)
      return mapLibrariesToScanPaths(data)
    },
  })
}

export function useReplaceNodeLibraries(serverId: number | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (paths: NodeScanPath[]) => {
      if (!serverId) throw new Error('No Otix node selected')
      if (isLocalDesktopNodeId(serverId)) {
        const api = getDesktopAPI()
        if (api?.saveScanPaths) {
          await api.saveScanPaths(paths)
        }
        return paths
      }
      const { data } = await apiClient.put(`/library/servers/${serverId}/libraries`, {
        libraries: paths.map((item) => ({
          name: item.path.split(/[\\/]/).filter(Boolean).pop() || item.type,
          path: item.path,
          kind: item.type,
        })),
      })
      return mapLibrariesToScanPaths(data)
    },
    onSuccess: () => {
      if (serverId) void queryClient.invalidateQueries({ queryKey: nodeSettingsKeys(serverId).libraries })
    },
  })
}

export function useScanNodeLibraries(serverId: number | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error('No Otix node selected')
      if (isLocalDesktopNodeId(serverId)) {
        const api = getDesktopAPI()
        if (api?.scanPaths && api?.getScanPaths) {
          const raw = (await api.getScanPaths()) || []
          const gameDirs = raw.filter((p: any) => p.type !== 'iso').map((p: any) => p.path)
          const isoDirs = raw.filter((p: any) => p.type === 'iso').map((p: any) => p.path)
          await api.scanPaths(gameDirs, isoDirs)
        }
        return { status: 'ok', message: 'Local scan completed' }
      }
      const { data } = await apiClient.post(`/library/servers/${serverId}/scan`)
      return data
    },
  })
}

export function useNodeOrganize(serverId: number | null | undefined) {
  return useQuery({
    queryKey: serverId ? nodeSettingsKeys(serverId).organize : ['game-servers', 'organize', 'idle'],
    enabled: Boolean(serverId),
    queryFn: async () => {
      if (isLocalDesktopNodeId(serverId)) {
        return {
          postProcessEnabled: true,
          autoSearchWishlist: false,
          wishlistIntervalHours: 12,
          preferredRepackers: '',
          allowHypervisor: false,
          autoOrganizeEnabled: false,
          namingTemplate: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}',
          isoDownloadPath: '',
          scanOnLaunch: true,
          gamesDownloadPath: '',
        }
      }
      const { data } = await apiClient.get<NodeOrganizeSettings>(`/library/servers/${serverId}/organize`)
      return data
    },
  })
}

export function useSaveNodeOrganize(serverId: number | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<NodeOrganizeSettings>) => {
      if (!serverId) throw new Error('No Otix node selected')
      if (isLocalDesktopNodeId(serverId)) {
        return payload as NodeOrganizeSettings
      }
      const { data } = await apiClient.post<NodeOrganizeSettings>(
        `/library/servers/${serverId}/organize`,
        payload,
      )
      return data
    },
    onSuccess: () => {
      if (serverId) void queryClient.invalidateQueries({ queryKey: nodeSettingsKeys(serverId).organize })
    },
  })
}

export async function saveNodeDesktopSettings(
  serverId: number,
  payload: Record<string, unknown>,
) {
  const { data } = await apiClient.post(`/library/servers/${serverId}/desktop`, payload)
  return data
}

export async function loadNodeDesktopSettings(serverId: number) {
  const { data } = await apiClient.get(`/library/servers/${serverId}/desktop`)
  return data
}
