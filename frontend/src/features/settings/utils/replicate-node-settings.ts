import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { isLocalDesktopNodeId } from '../local-desktop-node'
import { isGlobalProfileId } from './node-switcher'
import type { DownloadConfig } from '@/features/downloads/types'
import { ISO_FOLDER_PRESETS } from './naming-template'
import { loadStoredDirectoryRules, saveStoredDirectoryRules } from './organize'

export interface ReplicateSettingsOptions {
  sourceNodeId: number
  targetNodeIds: number[]
  copyOrganize: boolean
  copyPaths: boolean
  dlConfig?: DownloadConfig | null
}

export interface ReplicateSettingsResult {
  successCount: number
  failedCount: number
  errors: Array<{ nodeId: number; message: string }>
}

export async function fetchSourceOrganizePayload(
  sourceNodeId: number,
  dlConfig?: DownloadConfig | null,
): Promise<Record<string, unknown>> {
  if (isGlobalProfileId(sourceNodeId)) {
    return {
      postProcessEnabled: dlConfig?.postProcessEnabled ?? true,
      autoSearchWishlist: dlConfig?.autoSearchWishlist ?? false,
      wishlistIntervalHours: dlConfig?.wishlistIntervalHours ?? 12,
      allowHypervisor: dlConfig?.allowHypervisor ?? false,
      autoOrganizeEnabled: dlConfig?.autoOrganizeEnabled ?? false,
      namingTemplate: dlConfig?.namingTemplate ?? ISO_FOLDER_PRESETS[0].template,
      preferredRepackers: dlConfig?.preferredRepackers ?? '',
    }
  }

  if (isLocalDesktopNodeId(sourceNodeId)) {
    const api = getDesktopAPI()
    let isoDownloadPath = ''
    let scanOnLaunch = false
    try {
      if (api?.getDesktopSettings) {
        const ds = await api.getDesktopSettings()
        isoDownloadPath = ds?.isoDownloadPath || ''
        scanOnLaunch = Boolean(ds?.scanOnLaunch)
      }
    } catch {
      // fallback
    }
    return {
      postProcessEnabled: dlConfig?.postProcessEnabled ?? true,
      autoSearchWishlist: dlConfig?.autoSearchWishlist ?? false,
      wishlistIntervalHours: dlConfig?.wishlistIntervalHours ?? 12,
      allowHypervisor: dlConfig?.allowHypervisor ?? false,
      autoOrganizeEnabled: dlConfig?.autoOrganizeEnabled ?? false,
      namingTemplate: dlConfig?.namingTemplate ?? ISO_FOLDER_PRESETS[0].template,
      preferredRepackers: dlConfig?.preferredRepackers ?? '',
      isoDownloadPath,
      scanOnLaunch,
    }
  }

  const res = await apiClient.get<Record<string, unknown>>(`/library/servers/${sourceNodeId}/organize`)
  return res.data || {}
}

export async function fetchSourcePathsPayload(
  sourceNodeId: number,
  dlConfig?: DownloadConfig | null,
): Promise<{ libraries: Array<{ name: string; path: string; kind?: string }>; downloadPath?: string }> {
  if (isGlobalProfileId(sourceNodeId) || isLocalDesktopNodeId(sourceNodeId)) {
    let libraries: Array<{ name: string; path: string; kind?: string }> = []
    let downloadPath = dlConfig?.downloadPath || ''

    if (isLocalDesktopNodeId(sourceNodeId)) {
      const api = getDesktopAPI()
      if (api?.getScanPaths) {
        try {
          const raw = await api.getScanPaths()
          if (Array.isArray(raw)) {
            libraries = raw.map((p) => ({
              name: p.path?.split(/[\\/]/).pop() || 'Games',
              path: p.path,
              kind: p.type || 'game',
            }))
          }
        } catch {
          // ignore
        }
      }
      if (api?.getDesktopSettings) {
        try {
          const ds = await api.getDesktopSettings()
          if (ds?.gamesDownloadPath) downloadPath = ds.gamesDownloadPath
        } catch {
          // ignore
        }
      }
    }

    if (libraries.length === 0) {
      try {
        const storedGames = JSON.parse(localStorage.getItem('otix:scan-paths') || '[]')
        const storedIsos = JSON.parse(localStorage.getItem('otix:iso-scan-paths') || '[]')
        libraries = [
          ...(Array.isArray(storedGames)
            ? storedGames.map((p: string) => ({ name: p.split(/[\\/]/).pop() || 'Games', path: p, kind: 'game' }))
            : []),
          ...(Array.isArray(storedIsos)
            ? storedIsos.map((p: string) => ({ name: p.split(/[\\/]/).pop() || 'ISOs', path: p, kind: 'iso' }))
            : []),
        ]
      } catch {
        // ignore
      }
    }

    return { libraries, downloadPath }
  }

  const [libRes, desktopRes] = await Promise.all([
    apiClient.get<any>(`/library/servers/${sourceNodeId}/libraries`).catch(() => ({ data: [] })),
    apiClient.get<any>(`/library/servers/${sourceNodeId}/desktop`).catch(() => ({ data: {} })),
  ])

  const rawLibs = Array.isArray(libRes?.data) ? libRes.data : libRes?.data?.libraries || []
  const downloadPath =
    desktopRes?.data?.gamesDownloadPath ||
    desktopRes?.data?.games_download_path ||
    ''

  return {
    libraries: rawLibs.map((item: any) => ({
      name: item.name || item.path?.split(/[\\/]/).pop() || 'Library',
      path: item.path,
      kind: item.kind || item.type || 'game',
    })),
    downloadPath,
  }
}

export async function replicateNodeSettings({
  sourceNodeId,
  targetNodeIds,
  copyOrganize,
  copyPaths,
  dlConfig,
}: ReplicateSettingsOptions): Promise<ReplicateSettingsResult> {
  let successCount = 0
  let failedCount = 0
  const errors: Array<{ nodeId: number; message: string }> = []

  let organizePayload: Record<string, unknown> | null = null
  let pathsPayload: { libraries: Array<{ name: string; path: string; kind?: string }>; downloadPath?: string } | null = null

  if (copyOrganize) {
    try {
      organizePayload = await fetchSourceOrganizePayload(sourceNodeId, dlConfig)
    } catch (err: unknown) {
      return {
        successCount: 0,
        failedCount: targetNodeIds.length,
        errors: [{ nodeId: sourceNodeId, message: (err as { message?: string })?.message || 'Failed to read source organize settings' }],
      }
    }
  }

  if (copyPaths) {
    try {
      pathsPayload = await fetchSourcePathsPayload(sourceNodeId, dlConfig)
    } catch (err: unknown) {
      return {
        successCount: 0,
        failedCount: targetNodeIds.length,
        errors: [{ nodeId: sourceNodeId, message: (err as { message?: string })?.message || 'Failed to read source paths' }],
      }
    }
  }

  for (const targetId of targetNodeIds) {
    try {
      if (isGlobalProfileId(targetId)) {
        // Not a valid target for node replication
        continue
      }

      if (organizePayload) {
        await apiClient.post(`/library/servers/${targetId}/organize`, organizePayload)
      }

      if (pathsPayload) {
        if (pathsPayload.libraries.length > 0) {
          await apiClient.put(`/library/servers/${targetId}/libraries`, {
            libraries: pathsPayload.libraries,
          })
        }
        if (pathsPayload.downloadPath) {
          await apiClient.post(`/library/servers/${targetId}/desktop`, {
            games_download_path: pathsPayload.downloadPath,
          })
        }
      }

      successCount++
    } catch (err: unknown) {
      failedCount++
      errors.push({
        nodeId: targetId,
        message: (err as { message?: string })?.message || `Failed to apply settings to node #${targetId}`,
      })
    }
  }

  return { successCount, failedCount, errors }
}

export interface ImportNodeSettingsOptions {
  sourceNodeId: number
  targetNodeId: number
  copyNaming?: boolean
  copyAutomation?: boolean
  copyFilters?: boolean
  copyPaths?: boolean
  dlConfig?: DownloadConfig | null
  saveConfig?: (cfg: any) => Promise<any>
}

export interface ImportNodeSettingsResult {
  success: boolean
  error?: string
}

export async function importNodeSettings({
  sourceNodeId,
  targetNodeId,
  copyNaming = true,
  copyAutomation = true,
  copyFilters = true,
  copyPaths = false,
  dlConfig,
  saveConfig,
}: ImportNodeSettingsOptions): Promise<ImportNodeSettingsResult> {
  try {
    const sourceOrganize = await fetchSourceOrganizePayload(sourceNodeId, dlConfig)
    const sourceRules = loadStoredDirectoryRules(sourceNodeId)

    let sourcePaths: {
      libraries: Array<{ name: string; path: string; kind?: string }>
      downloadPath?: string
    } | null = null
    if (copyPaths) {
      sourcePaths = await fetchSourcePathsPayload(sourceNodeId, dlConfig)
    }

    // Apply to Global Profile
    if (isGlobalProfileId(targetNodeId)) {
      if (saveConfig && dlConfig) {
        const nextConfig = { ...dlConfig }
        if (copyNaming && sourceOrganize.namingTemplate) {
          nextConfig.namingTemplate = String(sourceOrganize.namingTemplate)
        }
        if (copyAutomation) {
          if (typeof sourceOrganize.autoOrganizeEnabled === 'boolean') {
            nextConfig.autoOrganizeEnabled = sourceOrganize.autoOrganizeEnabled
          }
          if (typeof sourceOrganize.postProcessEnabled === 'boolean') {
            nextConfig.postProcessEnabled = sourceOrganize.postProcessEnabled
          }
          if (typeof sourceOrganize.autoSearchWishlist === 'boolean') {
            nextConfig.autoSearchWishlist = sourceOrganize.autoSearchWishlist
          }
          if (typeof sourceOrganize.wishlistIntervalHours === 'number') {
            nextConfig.wishlistIntervalHours = sourceOrganize.wishlistIntervalHours
          }
        }
        if (copyFilters) {
          if (typeof sourceOrganize.preferredRepackers === 'string') {
            nextConfig.preferredRepackers = sourceOrganize.preferredRepackers
          }
          if (typeof sourceOrganize.allowHypervisor === 'boolean') {
            nextConfig.allowHypervisor = sourceOrganize.allowHypervisor
          }
        }
        await saveConfig(nextConfig)
      }
      if (copyNaming && sourceRules) {
        saveStoredDirectoryRules(sourceRules, targetNodeId)
      }
      return { success: true }
    }

    // Apply to Local Desktop
    if (isLocalDesktopNodeId(targetNodeId)) {
      const api = getDesktopAPI()
      if (api?.setDesktopSettings) {
        const desktopUpdates: Record<string, unknown> = {}
        if (copyAutomation && typeof sourceOrganize.scanOnLaunch === 'boolean') {
          desktopUpdates.scanOnLaunch = sourceOrganize.scanOnLaunch
        }
        if (Object.keys(desktopUpdates).length > 0) {
          await api.setDesktopSettings(desktopUpdates)
        }
      }
      if (saveConfig && dlConfig) {
        const nextConfig = { ...dlConfig }
        if (copyNaming && sourceOrganize.namingTemplate) {
          nextConfig.namingTemplate = String(sourceOrganize.namingTemplate)
        }
        if (copyAutomation) {
          if (typeof sourceOrganize.autoOrganizeEnabled === 'boolean') {
            nextConfig.autoOrganizeEnabled = sourceOrganize.autoOrganizeEnabled
          }
          if (typeof sourceOrganize.postProcessEnabled === 'boolean') {
            nextConfig.postProcessEnabled = sourceOrganize.postProcessEnabled
          }
          if (typeof sourceOrganize.autoSearchWishlist === 'boolean') {
            nextConfig.autoSearchWishlist = sourceOrganize.autoSearchWishlist
          }
        }
        if (copyFilters && typeof sourceOrganize.preferredRepackers === 'string') {
          nextConfig.preferredRepackers = sourceOrganize.preferredRepackers
        }
        await saveConfig(nextConfig)
      }
      if (copyNaming && sourceRules) {
        saveStoredDirectoryRules(sourceRules, targetNodeId)
      }
      return { success: true }
    }

    // Apply to Remote Worker Node
    const payload: Record<string, unknown> = {}
    if (copyNaming) {
      if (sourceOrganize.namingTemplate) payload.namingTemplate = sourceOrganize.namingTemplate
      if (sourceRules) payload.directoryRules = sourceRules
    }
    if (copyAutomation) {
      payload.autoOrganizeEnabled = sourceOrganize.autoOrganizeEnabled ?? false
      payload.postProcessEnabled = sourceOrganize.postProcessEnabled ?? true
      payload.autoSearchWishlist = sourceOrganize.autoSearchWishlist ?? false
      payload.wishlistIntervalHours = sourceOrganize.wishlistIntervalHours ?? 12
      if (typeof sourceOrganize.scanOnLaunch === 'boolean') {
        payload.scanOnLaunch = sourceOrganize.scanOnLaunch
      }
    }
    if (copyFilters) {
      payload.preferredRepackers = sourceOrganize.preferredRepackers ?? ''
      payload.allowHypervisor = sourceOrganize.allowHypervisor ?? false
    }

    await apiClient.post(`/library/servers/${targetNodeId}/organize`, payload)

    if (copyPaths && sourcePaths) {
      if (sourcePaths.libraries.length > 0) {
        await apiClient.put(`/library/servers/${targetNodeId}/libraries`, {
          libraries: sourcePaths.libraries,
        })
      }
      if (sourcePaths.downloadPath) {
        await apiClient.post(`/library/servers/${targetNodeId}/desktop`, {
          games_download_path: sourcePaths.downloadPath,
        })
      }
    }

    if (copyNaming && sourceRules) {
      saveStoredDirectoryRules(sourceRules, targetNodeId)
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as { message?: string })?.message || 'Failed to import settings from node.',
    }
  }
}
