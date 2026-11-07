import { useState, useEffect, useCallback, useMemo } from 'react'
import { useToast } from '@ui/molecules/toast'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import {
  type PathType,
  type ScanPathItem,
  type PathsFilterTab,
  normalizePath,
  normalizeScanPathItems,
  buildConfiguredFolderList,
  filterFolderItems,
} from '../utils/paths'

export const usePathsManagement = ({
  remoteNodeId,
  effectiveServerId,
  user,
  dlConfig,
  saveConfig,
  searchQuery,
  filterTab,
  loadSummary,
  handleTriggerScan,
}: {
  remoteNodeId: number | null
  effectiveServerId: number | null
  user: any
  dlConfig: any
  saveConfig: any
  searchQuery: string
  filterTab: PathsFilterTab
  loadSummary: () => Promise<void>
  handleTriggerScan: (path?: string) => Promise<void>
}) => {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // ── State ──
  const [scanPaths, setScanPaths] = useState<ScanPathItem[]>(() => {
    try {
      const key = remoteNodeId == null ? 'otix:scan-paths' : `otix:scan-paths:node:${remoteNodeId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        const normalized = normalizeScanPathItems(parsed)
        if (normalized.length > 0) return normalized
      }
      if (!remoteNodeId) {
        const storedGames = localStorage.getItem('otix:scan-paths')
        const storedIsos = localStorage.getItem('otix:iso-scan-paths')
        const items: ScanPathItem[] = []
        if (storedGames) {
          const parsed = JSON.parse(storedGames)
          items.push(...normalizeScanPathItems(parsed))
        }
        if (storedIsos) {
          const parsed = JSON.parse(storedIsos)
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              const rawStr = typeof p === 'string' ? p : p?.path
              if (typeof rawStr === 'string' && rawStr.trim()) {
                items.push({ path: rawStr.trim(), type: 'iso' })
              }
            }
          }
        }
        if (items.length > 0) return normalizeScanPathItems(items)
      }
    } catch {
      // ignore
    }
    return []
  })

  const [gamesInstallPath, setGamesInstallPath] = useState<string>(() => {
    try {
      const key = remoteNodeId == null ? 'otix:games-install-dir' : `otix:games-install-dir:node:${remoteNodeId}`
      return localStorage.getItem(key) || (!remoteNodeId ? localStorage.getItem('otix:games-install-dir') || '' : '')
    } catch {
      return ''
    }
  })

  const [gamesDownloadPath, setGamesDownloadPath] = useState<string>(() => {
    try {
      const key = remoteNodeId == null ? 'otix:games-download-dir' : `otix:games-download-dir:node:${remoteNodeId}`
      return localStorage.getItem(key) || (!remoteNodeId ? localStorage.getItem('otix:games-download-dir') || '' : '')
    } catch {
      return ''
    }
  })

  const [serverDownloadPath, setServerDownloadPath] = useState<string>(() => {
    try {
      const key = remoteNodeId == null ? 'otix:iso-download-dir' : `otix:iso-download-dir:node:${remoteNodeId}`
      return localStorage.getItem(key) || (!remoteNodeId ? localStorage.getItem('otix:iso-download-dir') || '' : '')
    } catch {
      return ''
    }
  })

  // Synchronize state from storage when remoteNodeId changes
  useEffect(() => {
    try {
      const installKey = remoteNodeId == null ? 'otix:games-install-dir' : `otix:games-install-dir:node:${remoteNodeId}`
      const downloadKey = remoteNodeId == null ? 'otix:games-download-dir' : `otix:games-download-dir:node:${remoteNodeId}`
      const isoKey = remoteNodeId == null ? 'otix:iso-download-dir' : `otix:iso-download-dir:node:${remoteNodeId}`
      const scanKey = remoteNodeId == null ? 'otix:scan-paths' : `otix:scan-paths:node:${remoteNodeId}`

      setGamesInstallPath(localStorage.getItem(installKey) || (!remoteNodeId ? localStorage.getItem('otix:games-install-dir') || '' : ''))
      setGamesDownloadPath(localStorage.getItem(downloadKey) || (!remoteNodeId ? localStorage.getItem('otix:games-download-dir') || '' : ''))
      setServerDownloadPath(localStorage.getItem(isoKey) || (!remoteNodeId ? localStorage.getItem('otix:iso-download-dir') || '' : ''))

      const cachedScan = localStorage.getItem(scanKey)
      if (cachedScan) {
        const parsed = JSON.parse(cachedScan)
        setScanPaths(normalizeScanPathItems(parsed))
      } else if (!remoteNodeId) {
        const storedGames = localStorage.getItem('otix:scan-paths')
        const storedIsos = localStorage.getItem('otix:iso-scan-paths')
        const items: ScanPathItem[] = []
        if (storedGames) {
          const parsed = JSON.parse(storedGames)
          items.push(...normalizeScanPathItems(parsed))
        }
        if (storedIsos) {
          const parsed = JSON.parse(storedIsos)
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              const rawStr = typeof p === 'string' ? p : p?.path
              if (typeof rawStr === 'string' && rawStr.trim()) {
                items.push({ path: rawStr.trim(), type: 'iso' })
              }
            }
          }
        }
        setScanPaths(normalizeScanPathItems(items))
      } else {
        setScanPaths([])
      }
    } catch {
      // ignore
    }
  }, [remoteNodeId])

  // ── Load scan paths from node, desktop API, or localStorage ──
  const loadScanPaths = useCallback(async () => {
    if (remoteNodeId) {
      try {
        const { data } = await apiClient.get(`/library/nodes/${remoteNodeId}/libraries`)
        const rows = Array.isArray(data) ? data : data?.libraries || []
        const items: ScanPathItem[] = rows
          .map((row: any) => ({
            path: String(row.path || '').trim(),
            type: row.kind === 'iso' || row.type === 'iso' ? ('iso' as const) : ('game' as const),
          }))
          .filter((row: ScanPathItem) => row.path)
        setScanPaths(items)
        try {
          localStorage.setItem(`otix:scan-paths:node:${remoteNodeId}`, JSON.stringify(items))
        } catch {
          // ignore
        }
        return
      } catch (err) {
        console.warn('Failed to get scan paths from Otix node:', err)
        return
      }
    }

    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    if (api?.getScanPaths) {
      try {
        const raw = await api.getScanPaths()
        if (Array.isArray(raw) && raw.length > 0) {
          const items: ScanPathItem[] = normalizeScanPathItems(raw)
          setScanPaths(items)
          try {
            localStorage.setItem('otix:scan-paths', JSON.stringify(items.filter((p) => p.type === 'game').map((p) => p.path)))
            localStorage.setItem('otix:iso-scan-paths', JSON.stringify(items.filter((p) => p.type === 'iso').map((p) => p.path)))
            if (effectiveServerId) {
              localStorage.setItem(`otix:scan-paths:node:${effectiveServerId}`, JSON.stringify(items))
            }
          } catch {
            // ignore
          }
          return
        }
      } catch (err) {
        console.warn('Failed to get scan paths from desktop API:', err)
      }
    }

    if (effectiveServerId) {
      try {
        const { data } = await apiClient.get(`/library/nodes/${effectiveServerId}/libraries`)
        const rows = Array.isArray(data) ? data : data?.libraries || []
        if (rows.length > 0) {
          const items: ScanPathItem[] = rows
            .map((row: any) => ({
              path: String(row.path || '').trim(),
              type: row.kind === 'iso' || row.type === 'iso' ? ('iso' as const) : ('game' as const),
            }))
            .filter((row: ScanPathItem) => row.path)
          setScanPaths(items)
          if (api?.saveScanPaths) {
            try {
              await api.saveScanPaths(items)
            } catch {
              // ignore
            }
          }
          return
        }
      } catch {
        // ignore
      }
    }

    // Fallback to localStorage
    try {
      const storedGames = localStorage.getItem('otix:scan-paths')
      const storedIsos = localStorage.getItem('otix:iso-scan-paths')
      const items: ScanPathItem[] = []
      if (storedGames) {
        const parsed = JSON.parse(storedGames)
        items.push(...normalizeScanPathItems(parsed))
      }
      if (storedIsos) {
        const parsed = JSON.parse(storedIsos)
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            const rawStr = typeof p === 'string' ? p : p?.path
            if (typeof rawStr === 'string' && rawStr.trim()) {
              items.push({ path: rawStr.trim(), type: 'iso' })
            }
          }
        }
      }
      setScanPaths(normalizeScanPathItems(items))
    } catch {
      // ignore
    }
  }, [remoteNodeId, effectiveServerId])

  useEffect(() => {
    void loadScanPaths()
  }, [loadScanPaths])

  // ── Load destination folders ──
  useEffect(() => {
    let cancelled = false
    const loadDestinations = async () => {
      if (remoteNodeId) {
        try {
          const [desktopRes, organizeRes] = await Promise.allSettled([
            apiClient.get<any>(`/library/nodes/${remoteNodeId}/desktop`),
            apiClient.get<any>(`/library/nodes/${remoteNodeId}/organize`),
          ])
          if (cancelled) return

          if (desktopRes.status === 'fulfilled') {
            const d = desktopRes.value?.data
            const gamesPath = d?.gamesDownloadPath || d?.games_download_path || ''
            const installPath = d?.gamesInstallPath || d?.games_install_path || ''
            if (gamesPath) {
              setGamesDownloadPath(gamesPath)
              try {
                localStorage.setItem(`otix:games-download-dir:node:${remoteNodeId}`, gamesPath)
              } catch {
                // ignore
              }
            }
            if (installPath) {
              setGamesInstallPath(installPath)
              try {
                localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, installPath)
              } catch {
                // ignore
              }
            }
          }

          if (organizeRes.status === 'fulfilled') {
            const org = organizeRes.value?.data
            const isoPath = org?.isoDownloadPath || org?.iso_download_path || ''
            const installPath = org?.gamesInstallPath || org?.games_install_path || ''
            if (isoPath) {
              setServerDownloadPath(isoPath)
              try {
                localStorage.setItem(`otix:iso-download-dir:node:${remoteNodeId}`, isoPath)
              } catch {
                // ignore
              }
            }
            if (installPath) {
              setGamesInstallPath((prev) => {
                const next = prev || installPath
                try {
                  localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, next)
                } catch {
                  // ignore
                }
                return next
              })
            }
          }
          return
        } catch {
          return
        }
      }

      const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
      let foundSettings = false
      if (api?.getDesktopSettings) {
        try {
          const ds = await api.getDesktopSettings()
          if (!cancelled && ds) {
            if (ds.gamesDownloadPath) {
              setGamesDownloadPath(ds.gamesDownloadPath)
              foundSettings = true
              try {
                localStorage.setItem('otix:games-download-dir', ds.gamesDownloadPath)
              } catch {
                // ignore
              }
            }
            if (ds.gamesInstallPath) {
              setGamesInstallPath(ds.gamesInstallPath)
              foundSettings = true
              try {
                localStorage.setItem('otix:games-install-dir', ds.gamesInstallPath)
              } catch {
                // ignore
              }
            }
            if (ds.isoDownloadPath) {
              setServerDownloadPath(ds.isoDownloadPath)
              foundSettings = true
              try {
                localStorage.setItem('otix:iso-download-dir', ds.isoDownloadPath)
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (!foundSettings && effectiveServerId) {
        try {
          const [desktopRes, organizeRes] = await Promise.allSettled([
            apiClient.get<any>(`/library/nodes/${effectiveServerId}/desktop`),
            apiClient.get<any>(`/library/nodes/${effectiveServerId}/organize`),
          ])
          if (cancelled) return
          if (desktopRes.status === 'fulfilled') {
            const d = desktopRes.value?.data
            const gamesPath = d?.gamesDownloadPath || d?.games_download_path || ''
            const installPath = d?.gamesInstallPath || d?.games_install_path || ''
            if (gamesPath) setGamesDownloadPath(gamesPath)
            if (installPath) setGamesInstallPath(installPath)
          }
          if (organizeRes.status === 'fulfilled') {
            const org = organizeRes.value?.data
            const isoPath = org?.isoDownloadPath || org?.iso_download_path || ''
            if (isoPath) setServerDownloadPath(isoPath)
          }
        } catch {
          // ignore
        }
      }
    }
    void loadDestinations()
    return () => {
      cancelled = true
    }
  }, [remoteNodeId, effectiveServerId])

  // Keep ISO destination in sync with download config for local desktop
  useEffect(() => {
    if (!remoteNodeId && dlConfig?.downloadPath) {
      setServerDownloadPath((prev) => {
        if (prev) return prev
        try {
          localStorage.setItem('otix:iso-download-dir', dlConfig.downloadPath!)
        } catch {
          // ignore
        }
        return dlConfig.downloadPath!
      })
    }
  }, [remoteNodeId, dlConfig?.downloadPath])

  // Helper to persist scan paths
  const persistScanPaths = async (updated: ScanPathItem[]) => {
    const normalized = normalizeScanPathItems(updated)
    setScanPaths(normalized)
    const syncTargetId = remoteNodeId || effectiveServerId
    if (remoteNodeId) {
      try {
        localStorage.setItem(`otix:scan-paths:node:${remoteNodeId}`, JSON.stringify(normalized))
      } catch {
        // ignore
      }
      try {
        await apiClient.put(`/library/nodes/${remoteNodeId}/libraries`, {
          libraries: normalized.map((item) => ({
            name: item.path.split(/[\\/]/).filter(Boolean).pop() || item.type,
            path: item.path,
            kind: item.type,
          })),
        })
      } catch (err) {
        console.error('Failed to save scan paths to Otix node:', err)
      }
      return
    }
    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    if (api?.saveScanPaths) {
      try {
        await api.saveScanPaths(
          normalized.map((item) => ({
            path: item.path,
            type: item.type === 'provider' || item.type === 'iso' ? 'iso' : 'game',
          })),
        )
      } catch (err) {
        console.error('Failed to save scan paths:', err)
      }
    }
    try {
      localStorage.setItem(
        'otix:scan-paths',
        JSON.stringify(normalized.filter((i) => i.type === 'game' || i.type === 'installed').map((i) => i.path)),
      )
      localStorage.setItem(
        'otix:iso-scan-paths',
        JSON.stringify(normalized.filter((i) => i.type === 'iso' || i.type === 'provider').map((i) => i.path)),
      )
      if (syncTargetId) {
        localStorage.setItem(`otix:scan-paths:node:${syncTargetId}`, JSON.stringify(normalized))
      }
    } catch {
      // ignore
    }

    if (syncTargetId) {
      try {
        await apiClient.put(`/library/nodes/${syncTargetId}/libraries`, {
          libraries: normalized.map((item) => ({
            name: item.path.split(/[\\/]/).filter(Boolean).pop() || item.type,
            path: item.path,
            kind: item.type === 'provider' || item.type === 'iso' ? 'provider' : 'installed',
          })),
        })
      } catch (err) {
        console.warn('Failed to sync scan paths to backend server:', err)
      }
    }
  }

  // ── Save Installation Directory Handler ──
  const handleSaveGamesInstallPath = async (path: string) => {
    const trimmed = path.trim()
    const isClearing = !trimmed
    let remoteFailed = false
    setGamesInstallPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          if (isClearing) {
            localStorage.removeItem(`otix:games-install-dir:node:${remoteNodeId}`)
          } else {
            localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, trimmed)
          }
        } catch {
          // ignore
        }
        try {
          await apiClient.post(`/library/nodes/${remoteNodeId}/desktop`, { gamesInstallPath: trimmed })
        } catch (err) {
          console.warn('Node is disconnected or unreachable while updating gamesInstallPath:', err)
          remoteFailed = true
        }
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ gamesInstallPath: trimmed })
        }
        try {
          if (isClearing) {
            localStorage.removeItem('otix:games-install-dir')
          } else {
            localStorage.setItem('otix:games-install-dir', trimmed)
          }
          if (effectiveServerId) {
            if (isClearing) {
              localStorage.removeItem(`otix:games-install-dir:node:${effectiveServerId}`)
            } else {
              localStorage.setItem(`otix:games-install-dir:node:${effectiveServerId}`, trimmed)
            }
          }
        } catch {
          // ignore
        }
        if (effectiveServerId) {
          try {
            await apiClient.post(`/library/nodes/${effectiveServerId}/desktop`, { gamesInstallPath: trimmed })
          } catch {
            // ignore
          }
        }
      }

      // Automatically register in scanPaths if not already present
      if (trimmed) {
        const exists = scanPaths.some((p) => p.path === trimmed && p.type === 'game')
        if (!exists) {
          const updated = [...scanPaths, { path: trimmed, type: 'game' as const }]
          await persistScanPaths(updated)
        }
      }

      if (isClearing) {
        toast({
          title: 'Installation Directory Cleared',
          description: remoteFailed
            ? 'Cleared locally (node is disconnected/offline).'
            : 'Installation directory has been unassigned.',
          variant: 'default',
        })
      } else {
        toast({
          title: 'Installation Directory Updated',
          description: remoteFailed
            ? `Saved locally: ${trimmed} (node is offline; will sync when reconnected)`
            : `Assigned as Installation folder: ${trimmed}`,
          variant: remoteFailed ? 'default' : 'success',
        })
      }
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not save game installation directory.',
        variant: 'error',
      })
    }
  }

  // ── Save Games Download Directory Handler (Limited to 1) ──
  const handleSaveGamesPath = async (path: string) => {
    const trimmed = path.trim()
    const isClearing = !trimmed
    let remoteFailed = false
    setGamesDownloadPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          if (isClearing) {
            localStorage.removeItem(`otix:games-download-dir:node:${remoteNodeId}`)
          } else {
            localStorage.setItem(`otix:games-download-dir:node:${remoteNodeId}`, trimmed)
          }
        } catch {
          // ignore
        }
        try {
          await apiClient.post(`/library/nodes/${remoteNodeId}/desktop`, { gamesDownloadPath: trimmed })
        } catch (err) {
          console.warn('Node is disconnected or unreachable while updating gamesDownloadPath:', err)
          remoteFailed = true
        }
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ gamesDownloadPath: trimmed })
        }
        try {
          if (isClearing) {
            localStorage.removeItem('otix:games-download-dir')
          } else {
            localStorage.setItem('otix:games-download-dir', trimmed)
          }
          if (effectiveServerId) {
            if (isClearing) {
              localStorage.removeItem(`otix:games-download-dir:node:${effectiveServerId}`)
            } else {
              localStorage.setItem(`otix:games-download-dir:node:${effectiveServerId}`, trimmed)
            }
          }
        } catch {
          // ignore
        }
        if (effectiveServerId) {
          try {
            await apiClient.post(`/library/nodes/${effectiveServerId}/desktop`, { gamesDownloadPath: trimmed })
          } catch {
            // ignore
          }
        }
      }

      // Automatically register in scanPaths if not already present
      if (trimmed) {
        const exists = scanPaths.some((p) => p.path === trimmed && p.type === 'game')
        if (!exists) {
          const updated = [...scanPaths, { path: trimmed, type: 'game' as const }]
          await persistScanPaths(updated)
        }
      }

      if (isClearing) {
        toast({
          title: 'Download Directory Cleared',
          description: remoteFailed
            ? 'Cleared locally (node is disconnected/offline).'
            : 'Download directory has been unassigned.',
          variant: 'default',
        })
      } else {
        toast({
          title: 'Games Directory Updated',
          description: remoteFailed
            ? `Saved locally: ${trimmed} (node is offline; will sync when reconnected)`
            : `Assigned as Games Download folder (1 max): ${trimmed}`,
          variant: remoteFailed ? 'default' : 'success',
        })
      }
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not save games directory.',
        variant: 'error',
      })
    }
  }

  // ── Save ISOs Directory Handler ──
  const handleSaveServerIsoPath = async (path: string) => {
    const trimmed = path.trim()
    const isClearing = !trimmed
    let remoteFailed = false
    setServerDownloadPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          if (isClearing) {
            localStorage.removeItem(`otix:iso-download-dir:node:${remoteNodeId}`)
          } else {
            localStorage.setItem(`otix:iso-download-dir:node:${remoteNodeId}`, trimmed)
          }
        } catch {
          // ignore
        }
        try {
          await apiClient.post(`/library/nodes/${remoteNodeId}/organize`, { isoDownloadPath: trimmed || '' })
        } catch (err) {
          console.warn('Node is disconnected or unreachable while updating isoDownloadPath:', err)
          remoteFailed = true
        }
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ isoDownloadPath: trimmed })
        }
        try {
          if (isClearing) {
            localStorage.removeItem('otix:iso-download-dir')
          } else {
            localStorage.setItem('otix:iso-download-dir', trimmed)
          }
          if (effectiveServerId) {
            if (isClearing) {
              localStorage.removeItem(`otix:iso-download-dir:node:${effectiveServerId}`)
            } else {
              localStorage.setItem(`otix:iso-download-dir:node:${effectiveServerId}`, trimmed)
            }
          }
        } catch {
          // ignore
        }

        if (effectiveServerId) {
          try {
            await apiClient.post(`/library/nodes/${effectiveServerId}/organize`, { isoDownloadPath: trimmed || '' })
          } catch {
            // ignore
          }
        }

        if (user && saveConfig && dlConfig) {
          try {
            await saveConfig({
              ...dlConfig,
              userId: user.id,
              downloadPath: trimmed || null,
            })
          } catch {
            // ignore
          }
        }
      }

      // Automatically register in scanPaths if not already present
      if (trimmed) {
        const exists = scanPaths.some((p) => p.path === trimmed && p.type === 'iso')
        if (!exists) {
          const updated = [...scanPaths, { path: trimmed, type: 'iso' as const }]
          await persistScanPaths(updated)
        }
      }

      if (isClearing) {
        toast({
          title: 'ISO Directory Cleared',
          description: remoteFailed
            ? 'Cleared locally (node is disconnected/offline).'
            : 'ISO directory has been reset.',
          variant: 'default',
        })
      } else {
        toast({
          title: 'ISO Directory Updated',
          description: remoteFailed
            ? `Saved locally: ${trimmed} (node is offline; will sync when reconnected)`
            : `Saved: ${trimmed}`,
          variant: remoteFailed ? 'default' : 'success',
        })
      }
    } catch (err) {
      console.error('Failed to save ISO path:', err)
      toast({
        title: 'Save Failed',
        description: 'Could not save ISO directory.',
        variant: 'error',
      })
    }
  }

  // ── Unified Configured Folder Items ──
  const configuredFolders = useMemo(() => {
    return buildConfiguredFolderList(scanPaths, gamesInstallPath, gamesDownloadPath, serverDownloadPath)
  }, [scanPaths, gamesInstallPath, gamesDownloadPath, serverDownloadPath])

  const filteredFolders = useMemo(() => {
    return filterFolderItems(configuredFolders, searchQuery, filterTab)
  }, [configuredFolders, searchQuery, filterTab])

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: configuredFolders.length,
      installation: configuredFolders.filter((f) => f.isInstallation).length,
      download: configuredFolders.filter((f) => f.isGamesDownload).length,
      iso: configuredFolders.filter((f) => f.isIso).length,
    }
  }, [configuredFolders])

  // ── Role Toggles / Assignments on Individual Items ──
  const handleToggleInstallation = (path: string) => {
    const isCurrently = normalizePath(gamesInstallPath) === normalizePath(path)
    if (isCurrently) {
      void handleSaveGamesInstallPath('')
    } else {
      void handleSaveGamesInstallPath(path)
    }
  }

  // Games Download Folder is STRICTLY LIMITED TO ONE
  const handleAssignDownload = (path: string) => {
    const isCurrently = normalizePath(gamesDownloadPath) === normalizePath(path)
    if (isCurrently) {
      void handleSaveGamesPath('')
    } else {
      void handleSaveGamesPath(path)
    }
  }

  const handleToggleIso = async (path: string) => {
    const norm = normalizePath(path)
    const existing = scanPaths.find((p) => normalizePath(p.path) === norm)
    const willBeIso = existing ? existing.type !== 'iso' : true

    let updated: ScanPathItem[]
    if (existing) {
      updated = scanPaths.map((p) =>
        normalizePath(p.path) === norm ? { ...p, type: willBeIso ? ('iso' as const) : ('game' as const) } : p,
      )
    } else {
      updated = [...scanPaths, { path, type: willBeIso ? ('iso' as const) : ('game' as const) }]
    }

    if (!willBeIso && normalizePath(serverDownloadPath) === norm) {
      void handleSaveServerIsoPath('')
    } else if (willBeIso && !serverDownloadPath) {
      void handleSaveServerIsoPath(path)
    }

    await persistScanPaths(updated)
    toast({
      title: willBeIso ? 'Assigned as ISO Folder' : 'Updated to Game Folder',
      description: `Configured ${path} as ${willBeIso ? 'an ISO disc library' : 'a game library'}.`,
      variant: 'success',
    })
  }

  // ── Remove Folder Handler ──
  const handleRemoveFolder = async (pathToRemove: string) => {
    const norm = normalizePath(pathToRemove)
    const updated = scanPaths.filter((p) => normalizePath(p.path) !== norm)
    await persistScanPaths(updated)

    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    if (api?.deleteGamesByDirectory) {
      try {
        await api.deleteGamesByDirectory(pathToRemove)
      } catch (err) {
        console.warn('Failed to delete games by directory:', err)
      }
    }

    if (normalizePath(gamesInstallPath) === norm) {
      void handleSaveGamesInstallPath('')
    }
    if (normalizePath(gamesDownloadPath) === norm) {
      void handleSaveGamesPath('')
    }
    if (normalizePath(serverDownloadPath) === norm) {
      void handleSaveServerIsoPath('')
    }

    toast({
      title: 'Path Removed',
      description: `Removed ${pathToRemove}.`,
      variant: 'default',
    })
    window.dispatchEvent(new Event('scanned-games-updated'))
    queryClient.invalidateQueries({ queryKey: ['library', 'server-games'] })
    queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
    await loadSummary()
  }

  // ── Copy Path to Clipboard ──
  const handleCopyPath = async (pathToCopy: string) => {
    try {
      await navigator.clipboard.writeText(pathToCopy)
      toast({
        title: 'Path Copied',
        description: pathToCopy,
        variant: 'default',
      })
    } catch {
      toast({
        title: 'Copy Failed',
        description: pathToCopy,
        variant: 'error',
      })
    }
  }

  // ── Add New Folder Handler ──
  const handleAddFolder = async (
    pathToAdd: string,
    draftRoles: { installation: boolean; download: boolean; iso: boolean },
  ) => {
    const p = pathToAdd.trim()
    if (!p) return

    const norm = normalizePath(p)
    const alreadyExists = scanPaths.some((item) => normalizePath(item.path) === norm)

    if (alreadyExists) {
      toast({
        title: 'Path Already Monitored',
        description: `This directory is already configured in paths.`,
        variant: 'warning',
      })
      return
    }

    const typeToAdd: PathType = draftRoles.iso ? 'iso' : 'game'
    const updated = [...scanPaths, { path: p, type: typeToAdd }]
    await persistScanPaths(updated)

    if (draftRoles.installation) {
      void handleSaveGamesInstallPath(p)
    }
    if (draftRoles.download) {
      void handleSaveGamesPath(p)
    }
    if (draftRoles.iso && !serverDownloadPath) {
      void handleSaveServerIsoPath(p)
    }

    toast({
      title: 'Scan Path Added',
      description: `Added ${p} to monitored scan paths.`,
      variant: 'success',
    })

    // Automatically trigger immediate scan of new directory
    void handleTriggerScan()
  }

  return {
    scanPaths,
    setScanPaths,
    gamesInstallPath,
    setGamesInstallPath,
    gamesDownloadPath,
    setGamesDownloadPath,
    serverDownloadPath,
    setServerDownloadPath,
    loadScanPaths,
    persistScanPaths,
    handleSaveGamesInstallPath,
    handleSaveGamesPath,
    handleSaveServerIsoPath,
    configuredFolders,
    filteredFolders,
    counts,
    handleToggleInstallation,
    handleAssignDownload,
    handleToggleIso,
    handleRemoveFolder,
    handleCopyPath,
    handleAddFolder,
  }
}
