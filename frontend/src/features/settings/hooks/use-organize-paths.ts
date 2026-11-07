import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  type PreviewItem,
  getOrganizerApi,
  loadStoredCustomPaths,
  saveStoredCustomPaths,
  buildFolderDropdownOptions,
} from '../utils/organize-test-run'

export interface UseOrganizePathsProps {
  open: boolean
  isoDirectory: string
  availableScanPaths?: Array<{ path: string; type?: string }>
}

export const useOrganizePaths = ({
  open,
  isoDirectory,
  availableScanPaths = [],
}: UseOrganizePathsProps) => {
  const [customPaths, setCustomPaths] = useState<string[]>(loadStoredCustomPaths)
  const [discoveredPaths, setDiscoveredPaths] = useState<Array<{ path: string; type?: string }>>([])

  // Dynamically discover configured desktop paths if none were passed
  useEffect(() => {
    if (!open) return
    const api = getOrganizerApi()
    if (!api) return

    let cancelled = false
    const collected: Array<{ path: string; type?: string }> = []

    if (api.getScanPaths) {
      api
        .getScanPaths()
        .then((paths: any) => {
          if (cancelled || !Array.isArray(paths)) return
          paths.forEach((p) => {
            if (p?.path) collected.push({ path: String(p.path).trim(), type: p.type || 'game' })
          })
          if (collected.length > 0) {
            setDiscoveredPaths((prev) => [...prev, ...collected])
          }
        })
        .catch(() => {})
    }

    if (api.getDesktopSettings) {
      api
        .getDesktopSettings()
        .then((ds: any) => {
          if (cancelled || !ds) return
          const settingsPaths: Array<{ path: string; type?: string }> = []
          if (ds.isoDownloadPath) settingsPaths.push({ path: ds.isoDownloadPath.trim(), type: 'ISO' })
          if (ds.gamesDownloadPath) settingsPaths.push({ path: ds.gamesDownloadPath.trim(), type: 'Downloads' })
          if (ds.gamesInstallPath) settingsPaths.push({ path: ds.gamesInstallPath.trim(), type: 'Library' })
          if (settingsPaths.length > 0) {
            setDiscoveredPaths((prev) => [...prev, ...settingsPaths])
          }
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [open])

  const mergedScanPaths = useMemo(() => {
    const map = new Map<string, string | undefined>()
    availableScanPaths.forEach((p) => map.set(p.path.toLowerCase(), p.type))
    discoveredPaths.forEach((p) => {
      if (!map.has(p.path.toLowerCase())) {
        map.set(p.path.toLowerCase(), p.type)
      }
    })
    return Array.from(map.entries()).map(([pathLower, type]) => {
      const orig =
        availableScanPaths.find((p) => p.path.toLowerCase() === pathLower)?.path ??
        discoveredPaths.find((p) => p.path.toLowerCase() === pathLower)?.path ??
        pathLower
      return { path: orig, type }
    })
  }, [availableScanPaths, discoveredPaths])

  const folderOptions = useMemo(() => {
    return buildFolderDropdownOptions(isoDirectory, mergedScanPaths, customPaths)
  }, [isoDirectory, mergedScanPaths, customPaths])

  const initialDir = isoDirectory || folderOptions[0]?.value || ''
  const [selectedFolder, setSelectedFolder] = useState<string>(initialDir)

  const addCustomPath = useCallback((path: string) => {
    const trimmed = path.trim()
    setCustomPaths((prev) => {
      const next = prev.includes(trimmed) ? prev : [...prev, trimmed]
      saveStoredCustomPaths(next)
      return next
    })
    setSelectedFolder(trimmed)
  }, [])

  return {
    customPaths,
    discoveredPaths,
    folderOptions,
    initialDir,
    selectedFolder,
    setSelectedFolder,
    addCustomPath,
  }
}
