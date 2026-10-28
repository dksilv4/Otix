import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Search,
  Sparkles,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { pendingNodesToClaim } from '@/features/downloads/pending-nodes'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useSettingsNode } from '../../context/settings-node-context'
import { isLocalDesktopNode, isLocalDesktopNodeId } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { useQueryClient } from '@tanstack/react-query'
import { SectionHeader } from '../molecules/settings-section-header'
import { PathFolderCard } from '../molecules/path-folder-card'
import { PathFolderRow } from '../molecules/path-folder-row'
import { useScanProgress } from '../../hooks/use-scan-progress'
import { AddPathFolderCard } from '../molecules/add-path-folder-card'
import { ScannedFilesSummary } from '../molecules/scanned-files-summary'
import { ViewScannedGamesModal } from './view-scanned-games-modal'
import { MatchReviewCenterModal } from './match-review-center-modal'
import {
  useGameMatches,
} from '../../hooks/use-node-paths'
import {
  type ScannedFilesSummaryData,
  fetchDesktopScannedSummary,
  fetchNodeScannedSummary,
  loadStoredScannedSummary,
  saveStoredScannedSummary,
} from '../../utils/scanned-summary'
import {
  type PathType,
  type ScanPathItem,
  type PathsViewMode,
  type PathsFilterTab,
  normalizePath,
  getBaseFolderName,
  buildConfiguredFolderList,
  filterFolderItems,
  loadStoredPathsViewMode,
  saveStoredPathsViewMode,
  getSuggestedDefaultPaths,
  useClaimGameServer,
} from '../../utils/paths'
import { cn } from '@/lib/utils'
import { formatScanError } from '@/lib/utils/scan-errors'

export interface SettingsPathsSectionProps {
  onScanComplete?: () => void
  onNavigateToOrganize?: () => void
  className?: string
  /** When set, load and save paths on this Otix node instead of the page-level selection. */
  nodeId?: number | null
}

export const SettingsPathsSection = ({
  onScanComplete,
  onNavigateToOrganize: onNavigateToOrganizeProp,
  className,
  nodeId: nodeIdProp,
}: SettingsPathsSectionProps) => {
  const { toast } = useToast()
  let user: any = null
  try {
    const auth = useAuth()
    user = auth?.user
  } catch {
    // Graceful fallback for test environments without AuthProvider
  }

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode, servers, pendingNodes = [], setSelectedNodeId } = useSettingsNode()
  const claimServerMutation = useClaimGameServer()
  const [isClaimingDiscovered, setIsClaimingDiscovered] = useState(false)
  const unclaimedNodes = useMemo(() => pendingNodesToClaim(pendingNodes, servers), [pendingNodes, servers])
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const activeNode = servers?.find((s) => s.id === nodeId) ?? (selectedNode?.id === nodeId ? selectedNode : null)
  const isLocalNode = isLocalDesktopNode(activeNode) || isLocalDesktopNodeId(nodeId)
  const isGlobalProfile = nodeId === 0
  const remoteNodeId = isLocalNode || isGlobalProfile ? null : nodeId
  const desktop = isDesktop()
  const folderTarget = remoteNodeId ? 'server' : desktop ? 'local' : 'server'

  // ── State ──
  const [scanPaths, setScanPaths] = useState<ScanPathItem[]>(() => {
    try {
      const key = remoteNodeId == null ? 'otix:scan-paths' : `otix:scan-paths:node:${remoteNodeId}`
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
      if (!remoteNodeId) {
        const storedGames = localStorage.getItem('otix:scan-paths')
        const storedIsos = localStorage.getItem('otix:iso-scan-paths')
        const items: ScanPathItem[] = []
        if (storedGames) {
          const parsed = JSON.parse(storedGames)
          if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'game' as const })))
        }
        if (storedIsos) {
          const parsed = JSON.parse(storedIsos)
          if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'iso' as const })))
        }
        if (items.length > 0) return items
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

  // View & Filter State
  const [viewMode, setViewMode] = useState<PathsViewMode>(() => loadStoredPathsViewMode())
  const [filterTab, setFilterTab] = useState<PathsFilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Add folder form state
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [draftPath, setDraftPath] = useState('')
  const [draftRoles, setDraftRoles] = useState<{
    installation: boolean
    download: boolean
    iso: boolean
  }>({
    installation: false,
    download: false,
    iso: false,
  })

  // Loading & Scanning State
  const [isScanning, setIsScanning] = useState(false)
  const scanProgress = useScanProgress()
  const [isClearingScan, setIsClearingScan] = useState(false)
  const [isSyncingOtix, setIsSyncingOtix] = useState(false)
  const [writeOtixAfterScan, setWriteOtixAfterScan] = useState(false)
  const [downloadOtixImages, setDownloadOtixImages] = useState(false)
  const [matchCenterOpen, setMatchCenterOpen] = useState(false)

  const { data: gameMatches = [] } = useGameMatches()
  const pendingMatchesCount = useMemo(
    () => (Array.isArray(gameMatches) ? gameMatches.filter((m) => m?.matchStatus === 'needs_review' || m?.matchStatus === 'unmatched').length : 0),
    [gameMatches],
  )

  // Scanned files quick summary state
  const queryClient = useQueryClient()
  const [viewGamesModalOpen, setViewGamesModalOpen] = useState(false)
  const suggestedPaths = useMemo(() => getSuggestedDefaultPaths(scanPaths), [scanPaths])

  const [summary, setSummary] = useState<ScannedFilesSummaryData | null>(() => {
    return loadStoredScannedSummary(remoteNodeId)
  })
  const [isSummaryLoading, setIsSummaryLoading] = useState(false)

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true)
    try {
      if (remoteNodeId) {
        const data = await fetchNodeScannedSummary(remoteNodeId, serverDownloadPath, gamesInstallPath)
        if (data) {
          setSummary(data)
          saveStoredScannedSummary(data, remoteNodeId)
        }
      } else {
        const data = await fetchDesktopScannedSummary(gamesInstallPath, serverDownloadPath)
        setSummary(data)
        saveStoredScannedSummary(data, null)
      }
    } catch {
      // ignore
    } finally {
      setIsSummaryLoading(false)
    }
  }, [remoteNodeId, serverDownloadPath, gamesInstallPath])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    const handleUpdated = () => void loadSummary()
    window.addEventListener('scanned-games-updated', handleUpdated)
    const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
    const unsub = api?.onGamesUpdated?.(() => void loadSummary())
    return () => {
      window.removeEventListener('scanned-games-updated', handleUpdated)
      unsub?.()
    }
  }, [loadSummary])

  const handleNavigateToOrganize = () => {
    if (onNavigateToOrganizeProp) {
      onNavigateToOrganizeProp()
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/settings/organize'
    }
  }

  // Synchronize view mode with localStorage
  const handleSetViewMode = (mode: PathsViewMode) => {
    setViewMode(mode)
    saveStoredPathsViewMode(mode)
  }

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
        if (Array.isArray(parsed)) setScanPaths(parsed)
      } else if (!remoteNodeId) {
        const storedGames = localStorage.getItem('otix:scan-paths')
        const storedIsos = localStorage.getItem('otix:iso-scan-paths')
        const items: ScanPathItem[] = []
        if (storedGames) {
          const parsed = JSON.parse(storedGames)
          if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'game' as const })))
        }
        if (storedIsos) {
          const parsed = JSON.parse(storedIsos)
          if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'iso' as const })))
        }
        setScanPaths(items)
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
        const { data } = await apiClient.get(`/library/servers/${remoteNodeId}/libraries`)
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
        if (Array.isArray(raw)) {
          const items: ScanPathItem[] = raw.map((p: any) => ({
            path: p.path,
            type: p.type === 'iso' ? 'iso' : 'game',
          }))
          setScanPaths(items)
          try {
            localStorage.setItem('otix:scan-paths', JSON.stringify(items.filter((p) => p.type === 'game').map((p) => p.path)))
            localStorage.setItem('otix:iso-scan-paths', JSON.stringify(items.filter((p) => p.type === 'iso').map((p) => p.path)))
          } catch {
            // ignore
          }
          return
        }
      } catch (err) {
        console.warn('Failed to get scan paths from desktop API:', err)
      }
    }

    // Fallback to localStorage
    try {
      const storedGames = localStorage.getItem('otix:scan-paths')
      const storedIsos = localStorage.getItem('otix:iso-scan-paths')
      const items: ScanPathItem[] = []
      if (storedGames) {
        const parsed = JSON.parse(storedGames)
        if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'game' as const })))
      }
      if (storedIsos) {
        const parsed = JSON.parse(storedIsos)
        if (Array.isArray(parsed)) items.push(...parsed.map((p: string) => ({ path: p, type: 'iso' as const })))
      }
      setScanPaths(items)
    } catch {
      // ignore
    }
  }, [remoteNodeId])

  useEffect(() => {
    loadScanPaths()
  }, [loadScanPaths])

  // ── Load node otix settings ──
  useEffect(() => {
    let cancelled = false
    const loadOtixSettings = async () => {
      if (!remoteNodeId) {
        setWriteOtixAfterScan(false)
        setDownloadOtixImages(false)
        return
      }
      try {
        const { data } = await apiClient.get<{
          writeOtixAfterScan?: boolean
          downloadOtixImages?: boolean
        }>(`/library/servers/${remoteNodeId}/otix/settings`)
        if (cancelled) return
        if (typeof data?.writeOtixAfterScan === 'boolean') {
          setWriteOtixAfterScan(data.writeOtixAfterScan)
        }
        if (typeof data?.downloadOtixImages === 'boolean') {
          setDownloadOtixImages(data.downloadOtixImages)
        }
      } catch {
        // Node may be offline or on an older build
      }
    }
    void loadOtixSettings()
    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

  const persistOtixSettings = async (next: {
    writeOtixAfterScan?: boolean
    downloadOtixImages?: boolean
  }) => {
    if (!remoteNodeId) return
    const { data } = await apiClient.post<{
      writeOtixAfterScan?: boolean
      downloadOtixImages?: boolean
    }>(`/library/servers/${remoteNodeId}/otix/settings`, next)
    if (typeof data?.writeOtixAfterScan === 'boolean') {
      setWriteOtixAfterScan(data.writeOtixAfterScan)
    }
    if (typeof data?.downloadOtixImages === 'boolean') {
      setDownloadOtixImages(data.downloadOtixImages)
    }
  }

  // ── Load destination folders ──
  useEffect(() => {
    let cancelled = false
    const loadDestinations = async () => {
      if (remoteNodeId) {
        try {
          const [desktopRes, organizeRes] = await Promise.allSettled([
            apiClient.get<any>(`/library/servers/${remoteNodeId}/desktop`),
            apiClient.get<any>(`/library/servers/${remoteNodeId}/organize`),
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
      if (api?.getDesktopSettings) {
        try {
          const ds = await api.getDesktopSettings()
          if (!cancelled && ds) {
            if (ds.gamesDownloadPath) {
              setGamesDownloadPath(ds.gamesDownloadPath)
              try {
                localStorage.setItem('otix:games-download-dir', ds.gamesDownloadPath)
              } catch {
                // ignore
              }
            }
            if (ds.gamesInstallPath) {
              setGamesInstallPath(ds.gamesInstallPath)
              try {
                localStorage.setItem('otix:games-install-dir', ds.gamesInstallPath)
              } catch {
                // ignore
              }
            }
            if (ds.isoDownloadPath) {
              setServerDownloadPath(ds.isoDownloadPath)
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
    }
    void loadDestinations()
    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

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
    setScanPaths(updated)
    if (remoteNodeId) {
      try {
        localStorage.setItem(`otix:scan-paths:node:${remoteNodeId}`, JSON.stringify(updated))
      } catch {
        // ignore
      }
      try {
        await apiClient.put(`/library/servers/${remoteNodeId}/libraries`, {
          libraries: updated.map((item) => ({
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
        await api.saveScanPaths(updated)
      } catch (err) {
        console.error('Failed to save scan paths:', err)
      }
    }
    try {
      localStorage.setItem('otix:scan-paths', JSON.stringify(updated.filter((i) => i.type === 'game').map((i) => i.path)))
      localStorage.setItem('otix:iso-scan-paths', JSON.stringify(updated.filter((i) => i.type === 'iso').map((i) => i.path)))
    } catch {
      // ignore
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
          await apiClient.post(`/library/servers/${remoteNodeId}/desktop`, { gamesInstallPath: trimmed })
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
        } catch {
          // ignore
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
          await apiClient.post(`/library/servers/${remoteNodeId}/desktop`, { gamesDownloadPath: trimmed })
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
        } catch {
          // ignore
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
          await apiClient.post(`/library/servers/${remoteNodeId}/organize`, { isoDownloadPath: trimmed || '' })
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
        } catch {
          // ignore
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
  const handleAddFolder = async (pathToAdd: string) => {
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

    setDraftPath('')
    setDraftRoles({ installation: false, download: false, iso: false })
    setIsAddingFolder(false)

    toast({
      title: 'Scan Path Added',
      description: `Added ${p} to monitored scan paths.`,
      variant: 'success',
    })

    // Automatically trigger immediate scan of new directory
    void handleTriggerScan()
  }

  // ── One-click Claim Discovered Node ──
  const handleClaimDiscoveredNode = async (node: any) => {
    if (!node?.claimCode) return
    setIsClaimingDiscovered(true)
    try {
      const claimed = await claimServerMutation.mutateAsync({
        claim_code: node.claimCode,
        node_url: node.localUrl || undefined,
        server_name: node.serverName,
        is_local: true,
      })
      toast({
        title: 'Node Claimed',
        description: `Successfully claimed ${claimed.name}. You can now manage and scan its folders.`,
        variant: 'success',
      })
      if (claimed?.id != null) {
        setSelectedNodeId(claimed.id)
      }
      setIsAddingFolder(true)
    } catch (err: any) {
      toast({
        title: 'Claim Failed',
        description: err?.response?.data?.error || err?.message || 'Could not claim node.',
        variant: 'error',
      })
    } finally {
      setIsClaimingDiscovered(false)
    }
  }

  // ── Trigger Scan Handler ──
  const handleTriggerScan = async (targetPath?: string | unknown) => {
    const specificPath = typeof targetPath === 'string' ? targetPath : undefined
    setIsScanning(true)
    scanProgress.startScan(
      specificPath
        ? `Scanning ${getBaseFolderName(specificPath)}...`
        : remoteNodeId
          ? 'Connecting to node...'
          : 'Scanning library paths...',
    )
    try {
      if (remoteNodeId) {
        scanProgress.reportProgress(10, 'Starting library scan on node...', 'scanning')
        // Trigger scan start
        await apiClient.post<{ count?: number; status?: string }>(
          `/library/servers/${remoteNodeId}/scan`,
          specificPath ? { path: specificPath } : undefined,
        )

        // Poll for real-time progress from node
        let scannedCount = 0
        for (let i = 0; i < 60; i++) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          try {
            const { data } = await apiClient.get<{
              phase?: string
              percentage?: number
              files_scanned?: number
              filesScanned?: number
              total_files?: number
              totalFiles?: number
              current_directory?: string
              currentDirectory?: string
              is_scanning?: boolean
              isScanning?: boolean
            }>(`/library/servers/${remoteNodeId}/scan`)

            const count = data?.totalFiles || data?.total_files || data?.filesScanned || data?.files_scanned || 0
            if (count > 0) scannedCount = count
            const pct = typeof data?.percentage === 'number' ? Math.max(15, Math.min(95, data.percentage)) : 30
            const dir = data?.currentDirectory || data?.current_directory || `Indexing files (${count} found)...`

            const scanning = data?.isScanning ?? (data?.phase === 'scanning' || data?.phase === 'running')
            if (scanning) {
              scanProgress.reportProgress(pct, dir, 'scanning')
            } else if (data?.phase === 'completed' || data?.phase === 'idle' || data?.phase === 'complete') {
              break
            }
          } catch (pollErr: any) {
            const { isUnreachable } = formatScanError(pollErr)
            if (isUnreachable || (pollErr?.response?.status && pollErr.response.status >= 500)) {
              throw pollErr
            }
            break
          }
        }

        if (writeOtixAfterScan || specificPath) {
          setIsSyncingOtix(true)
          scanProgress.reportProgress(65, 'Writing .otix metadata sidecars...', 'matching')
          try {
            const { data } = await apiClient.post<{
              written?: number
              matched?: number
              status?: string
              reason?: string
            }>(`/library/servers/${remoteNodeId}/otix/sync`, {
              writeOtix: true,
              downloadImages: downloadOtixImages,
              path: specificPath,
            })
            scanProgress.reportProgress(85, 'Writing .otix metadata sidecars...', 'matching')
            const written = data?.written ?? 0
            const matched = data?.matched ?? written
            scanProgress.finishScan(
              `Found ${scannedCount} files. Matched ${matched} game${matched === 1 ? '' : 's'}, wrote ${written} .otix sidecar${written === 1 ? '' : 's'}.`,
            )
            toast({
              title: 'Library scanned',
              description:
                data?.status === 'skipped'
                  ? `Scan finished. Found ${scannedCount} files. Sidecar write is disabled on this node.`
                  : `Indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'}. Matched ${matched} game${matched === 1 ? '' : 's'}, wrote ${written} .otix sidecar${written === 1 ? '' : 's'}.`,
              variant: 'success',
            })
          } catch (syncErr: any) {
            console.error('Otix sync failed:', syncErr)
            scanProgress.finishScan(
              `Found ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
            )
            toast({
              title: 'Scan Complete',
              description: `Indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node. Sidecar sync encountered an issue.`,
              variant: 'warning',
            })
          } finally {
            setIsSyncingOtix(false)
          }
        } else {
          scanProgress.finishScan(
            `Found ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
          )
          toast({
            title: 'Library Scanned',
            description: `Successfully indexed ${scannedCount} file${scannedCount === 1 ? '' : 's'} on node.`,
            variant: 'success',
          })
        }
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.scanPaths) {
          const isIsoPath = specificPath && scanPaths.some((p) => p.path === specificPath && p.type === 'iso')
          const gameDirs = specificPath
            ? isIsoPath
              ? []
              : [specificPath]
            : scanPaths.filter((p) => p.type === 'game').map((p) => p.path)
          const isoDirs = specificPath
            ? isIsoPath
              ? [specificPath]
              : []
            : scanPaths.filter((p) => p.type === 'iso').map((p) => p.path)
          scanProgress.reportProgress(15, `Scanning ${specificPath ? getBaseFolderName(specificPath) : 'configured local directories'}...`, 'scanning')
          await api.scanPaths(gameDirs, isoDirs)
        }
        scanProgress.finishScan(specificPath ? `Scanned ${getBaseFolderName(specificPath)} and matched metadata` : 'Local library scan complete')
        toast({
          title: 'Library Scanned',
          description: specificPath
            ? `Completed scanning and metadata matching for ${getBaseFolderName(specificPath)}.`
            : 'Completed scanning configured library and download paths.',
          variant: 'success',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['local-games'] })
      queryClient.invalidateQueries({ queryKey: ['server-games'] })
      queryClient.invalidateQueries({ queryKey: ['node-games'] })
      queryClient.invalidateQueries({ queryKey: ['library', 'matches'] })
      window.dispatchEvent(new Event('scanned-games-updated'))
      onScanComplete?.()
      await loadSummary()
    } catch (err: any) {
      console.error('Library scan failed:', err)
      const { message, isUnreachable } = formatScanError(err)
      scanProgress.errorScan(isUnreachable ? 'Node unreachable' : 'Library scan failed')
      toast({
        title: 'Scan Failed',
        description: message,
        variant: 'error',
      })
      if (remoteNodeId || isUnreachable) {
        queryClient.invalidateQueries({ queryKey: ['game-servers'] })
        queryClient.invalidateQueries({ queryKey: ['library', 'servers'] })
      }
    } finally {
      setIsScanning(false)
      setIsSyncingOtix(false)
    }
  }

  // ── Clear Indexed Scan List ──
  const handleClearScannedList = async () => {
    if (!remoteNodeId) return
    setIsClearingScan(true)
    try {
      await apiClient.post(`/library/servers/${remoteNodeId}/scan/clear`)
      onScanComplete?.()
      setSummary({
        totalCount: 0,
        organizedCount: 0,
        unorganizedCount: 0,
        matchedCount: 0,
        isoCount: 0,
        installedCount: 0,
        organizedPercentage: 0,
        lastScannedAt: new Date().toISOString(),
      })
      saveStoredScannedSummary(
        {
          totalCount: 0,
          organizedCount: 0,
          unorganizedCount: 0,
          matchedCount: 0,
          isoCount: 0,
          installedCount: 0,
          organizedPercentage: 0,
          lastScannedAt: new Date().toISOString(),
        },
        remoteNodeId,
      )
      toast({
        title: 'Scan list cleared',
        description: 'Indexed hosted files were cleared. Files on disk were not deleted.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Clear scan list failed:', err)
      const { message, isUnreachable } = formatScanError(err)
      toast({
        title: 'Clear failed',
        description: message,
        variant: 'error',
      })
      if (remoteNodeId || isUnreachable) {
        queryClient.invalidateQueries({ queryKey: ['game-servers'] })
        queryClient.invalidateQueries({ queryKey: ['library', 'servers'] })
      }
    } finally {
      setIsClearingScan(false)
    }
  }

  return (
    <div id="paths" className={cn('space-y-4 scroll-mt-28', className)}>
      <h2 className="sr-only">Paths</h2>

      {/* ── Discovered Node One-Click Claim Banner ── */}
      {unclaimedNodes.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-2xl bg-primary/[0.08] backdrop-blur-xl border border-white/[0.04] gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground truncate">
                  Discovered Otix Node: {unclaimedNodes[0].serverName || 'Otix Node'}
                </span>
                {unclaimedNodes[0].claimCode && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary">
                    PIN: {unclaimedNodes[0].claimCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {unclaimedNodes[0].localUrl} — Ready to pair and configure storage paths.
              </p>
            </div>
          </div>
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={() => handleClaimDiscoveredNode(unclaimedNodes[0])}
            loading={isClaimingDiscovered}
            className="h-8 px-3.5 text-xs font-bold shrink-0"
          >
            Claim & Add Folders
          </DkButton>
        </div>
      )}

      {/* ── Scanned Files Quick Summary with Integrated Real-time Progress ── */}
      <ScannedFilesSummary
        summary={summary}
        isLoading={isSummaryLoading || isScanning || isSyncingOtix}
        scanProgress={scanProgress.progress}
        scanCurrentDir={scanProgress.currentDir}
        scanPhase={scanProgress.phase}
        onOrganizeClick={handleNavigateToOrganize}
        onRescanClick={handleTriggerScan}
        onViewGamesClick={() => setViewGamesModalOpen(true)}
      />

      {/* ── Match Review Center Banner ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Game Match Review Center</h3>
              {pendingMatchesCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                  {pendingMatchesCount} need review
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pure database matching. Verify catalog links or correct candidate matches.
            </p>
          </div>
        </div>
        <DkButton
          size="sm"
          variant="outline"
          onClick={() => setMatchCenterOpen(true)}
          className="shrink-0 text-xs font-semibold rounded-xl cursor-pointer"
        >
          Open Match Center
        </DkButton>
      </div>

      {/* Remote Otix Node Sidecar Options */}
      {remoteNodeId ? (
        <SettingsCard className="space-y-3">
          <SectionHeader
            title="Otix Node Metadata Sync"
            description="Match games and save .otix sidecars and artwork directly on the remote server."
          />
          <SettingsRow
            label="Write .otix after scan"
            description="Match and hydrate games, then save an invisible .otix sidecar next to each folder."
            action={
              <DkSwitch
                checked={writeOtixAfterScan}
                onCheckedChange={async (checked) => {
                  setWriteOtixAfterScan(checked)
                  if (!checked) setDownloadOtixImages(false)
                  try {
                    await persistOtixSettings({
                      writeOtixAfterScan: checked,
                      downloadOtixImages: checked ? downloadOtixImages : false,
                    })
                  } catch (err) {
                    console.error('Failed to save otix settings:', err)
                    toast({
                      title: 'Could not save setting',
                      description: 'Otix Node may be offline or needs an update.',
                      variant: 'error',
                    })
                  }
                }}
              />
            }
          />
          <SettingsRow
            label="Download images locally"
            description="Save poster/backdrop/logo as .otix-*.jpg next to each game and reference them in the sidecar."
            action={
              <DkSwitch
                checked={downloadOtixImages}
                disabled={!writeOtixAfterScan}
                onCheckedChange={async (checked) => {
                  setDownloadOtixImages(checked)
                  try {
                    await persistOtixSettings({ downloadOtixImages: checked })
                  } catch (err) {
                    console.error('Failed to save otix settings:', err)
                    toast({
                      title: 'Could not save setting',
                      description: 'Otix Node may be offline or needs an update.',
                      variant: 'error',
                    })
                  }
                }}
              />
            }
          />
        </SettingsCard>
      ) : null}

        {/* ── Toolbar: Filter Tabs, Search & View Switcher ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                filterTab === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('installation')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                filterTab === 'installation'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              Installation ({counts.installation})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('download')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                filterTab === 'download'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              Downloads ({counts.download})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('iso')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                filterTab === 'iso'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)]',
              )}
            >
              ISOs ({counts.iso})
            </button>
          </div>

          {/* Search & View Mode Switcher */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter folders..."
                className="w-full pl-8 pr-3 py-1 rounded-xl text-xs bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Cards vs List Mode Switcher */}
            <div
              className="flex items-center rounded-xl bg-[var(--dk-surface-ghost)] p-0.5 border border-white/[0.04] shrink-0"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                onClick={() => handleSetViewMode('cards')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  viewMode === 'cards'
                    ? 'bg-[var(--dk-surface-base)] text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={viewMode === 'cards'}
                aria-label="Card View"
                title="Card View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('list')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  viewMode === 'list'
                    ? 'bg-[var(--dk-surface-base)] text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={viewMode === 'list'}
                aria-label="List View"
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>

            {/* Scan Actions */}
            {remoteNodeId ? (
              <DkButton
                size="sm"
                variant="ghost"
                onClick={handleClearScannedList}
                disabled={isScanning || isClearingScan || isSyncingOtix}
                loading={isClearingScan}
                className="h-8 shrink-0 cursor-pointer text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{isClearingScan ? 'Clearing…' : 'Clear list'}</span>
              </DkButton>
            ) : null}
            <DkButton
              size="sm"
              onClick={handleTriggerScan}
              disabled={isScanning || isClearingScan || isSyncingOtix}
              loading={isScanning || isSyncingOtix}
              className="h-8 shrink-0 cursor-pointer text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {isSyncingOtix ? 'Matching…' : isScanning ? 'Scanning...' : 'Scan Now'}
            </DkButton>
          </div>
        </div>

        {/* ── Configured Folders Display (Cards or List) ── */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <AddPathFolderCard
              isAdding={isAddingFolder}
              onStartAdding={() => setIsAddingFolder(true)}
              onCancelAdding={() => {
                setIsAddingFolder(false)
                setDraftPath('')
                setDraftRoles({ installation: false, download: false, iso: false })
              }}
              draftPath={draftPath}
              onDraftPathChange={setDraftPath}
              draftRoles={draftRoles}
              onToggleDraftRole={(role) =>
                setDraftRoles((prev) => ({ ...prev, [role]: !prev[role] }))
              }
              onSubmit={handleAddFolder}
              suggestions={suggestedPaths}
              onSelectSuggestion={(p) => handleAddFolder(p)}
              folderTarget={folderTarget}
              remoteNodeId={remoteNodeId}
              desktop={desktop}
              viewMode="cards"
            />
            {filteredFolders.map((item) => (
              <PathFolderCard
                key={item.path}
                item={item}
                onToggleInstallation={handleToggleInstallation}
                onAssignDownload={handleAssignDownload}
                onToggleIso={handleToggleIso}
                onRemove={handleRemoveFolder}
                onCopyPath={handleCopyPath}
                onRescan={(path) => handleTriggerScan(path)}
                isScanning={isScanning}
              />
            ))}
            {filteredFolders.length === 0 && searchQuery && (
              <div className="col-span-full flex flex-col items-center justify-center p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center">
                <p className="text-sm font-semibold text-foreground">No matching folders</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No folders match &quot;{searchQuery}&quot;. Try a different search term or role filter.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AddPathFolderCard
              isAdding={isAddingFolder}
              onStartAdding={() => setIsAddingFolder(true)}
              onCancelAdding={() => {
                setIsAddingFolder(false)
                setDraftPath('')
                setDraftRoles({ installation: false, download: false, iso: false })
              }}
              draftPath={draftPath}
              onDraftPathChange={setDraftPath}
              draftRoles={draftRoles}
              onToggleDraftRole={(role) =>
                setDraftRoles((prev) => ({ ...prev, [role]: !prev[role] }))
              }
              onSubmit={handleAddFolder}
              suggestions={suggestedPaths}
              onSelectSuggestion={(p) => handleAddFolder(p)}
              folderTarget={folderTarget}
              remoteNodeId={remoteNodeId}
              desktop={desktop}
              viewMode="list"
            />
            {filteredFolders.length === 0 && searchQuery ? (
              <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center">
                <p className="text-sm font-semibold text-foreground">No matching folders</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No folders match &quot;{searchQuery}&quot;. Try a different search term or role filter.
                </p>
              </div>
            ) : (
              filteredFolders.map((item) => (
                <PathFolderRow
                  key={item.path}
                  item={item}
                  onToggleInstallation={handleToggleInstallation}
                  onAssignDownload={handleAssignDownload}
                  onToggleIso={handleToggleIso}
                  onRemove={handleRemoveFolder}
                  onCopyPath={handleCopyPath}
                />
              ))
            )}
          </div>
        )}

      {viewGamesModalOpen && (
        <ViewScannedGamesModal
          open={viewGamesModalOpen}
          onOpenChange={setViewGamesModalOpen}
          nodeId={remoteNodeId}
          nodeName={selectedNode?.name || 'Local Desktop'}
        />
      )}

      {matchCenterOpen && (
        <MatchReviewCenterModal
          open={matchCenterOpen}
          onOpenChange={setMatchCenterOpen}
        />
      )}
    </div>
  )
}
