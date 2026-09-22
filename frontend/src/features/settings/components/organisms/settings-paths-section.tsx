import React, { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  RefreshCw,
  Trash2,
  Gamepad2,
  Disc,
  HardDrive,
} from 'lucide-react'
import { PathInput } from '@/components/path-picker'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useSettingsNode } from '../../context/settings-node-context'
import { isBackendNodeId } from '../../backend-node'
import { isLocalDesktopNodeId } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import { cn } from '@/lib/utils'

export interface ScanPathItem {
  path: string
  type: 'game' | 'iso'
}

export interface SettingsPathsSectionProps {
  onScanComplete?: () => void
  className?: string
  /** When set, load and save paths on this Otix node instead of the page-level selection. */
  nodeId?: number | null
}

export function SettingsPathsSection({ onScanComplete, className, nodeId: nodeIdProp }: SettingsPathsSectionProps) {
  const { toast } = useToast()
  let user: any = null
  try {
    const auth = useAuth()
    user = auth?.user
  } catch {
    // Graceful fallback for test environments without AuthProvider
  }

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode } = useSettingsNode()
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const isLocalNode = isLocalDesktopNodeId(nodeId)
  const backendNode = isBackendNodeId(nodeId)
  const remoteNodeId = isLocalNode ? null : nodeId
  const desktop = isDesktop()
  const folderTarget = remoteNodeId ? 'server' : desktop ? 'local' : 'server'

  const getStorageKey = useCallback((prefix: string) => {
    return remoteNodeId == null ? prefix : `${prefix}:node:${remoteNodeId}`
  }, [remoteNodeId])

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
    } catch {}
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

  const [isScanning, setIsScanning] = useState(false)
  const [draftScanPath, setDraftScanPath] = useState('')
  const [draftScanType, setDraftScanType] = useState<'game' | 'iso'>('game')

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
    } catch {}
  }, [remoteNodeId])

  // ── 1. Load scan paths from the selected node, desktop API, or localStorage ──
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
        } catch {}
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
          } catch {}
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
    } catch {}
  }, [remoteNodeId])

  useEffect(() => {
    loadScanPaths()
  }, [loadScanPaths])

  // ── 2. Load destination folders from the node or this device ──
  useEffect(() => {
    let cancelled = false
    async function loadDestinations() {
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
              } catch {}
            }
            if (installPath) {
              setGamesInstallPath(installPath)
              try {
                localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, installPath)
              } catch {}
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
              } catch {}
            }
            if (installPath) {
              setGamesInstallPath((prev) => {
                const next = prev || installPath
                try {
                  localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, next)
                } catch {}
                return next
              })
            }
          }
          return
        } catch {
          // ignore
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
              } catch {}
            }
            if (ds.gamesInstallPath) {
              setGamesInstallPath(ds.gamesInstallPath)
              try {
                localStorage.setItem('otix:games-install-dir', ds.gamesInstallPath)
              } catch {}
            }
            if (ds.isoDownloadPath) {
              setServerDownloadPath(ds.isoDownloadPath)
              try {
                localStorage.setItem('otix:iso-download-dir', ds.isoDownloadPath)
              } catch {}
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

  // Keep ISO destination in sync with download config for local desktop if not already set
  useEffect(() => {
    if (!remoteNodeId && dlConfig?.downloadPath) {
      setServerDownloadPath((prev) => {
        if (prev) return prev
        try {
          localStorage.setItem('otix:iso-download-dir', dlConfig.downloadPath!)
        } catch {}
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
      } catch {}
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
    } catch {}
  }

  // ── 3. Game Installation Directory Handler ──
  const handleSaveGamesInstallPath = async (path: string) => {
    const trimmed = path.trim()
    setGamesInstallPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          localStorage.setItem(`otix:games-install-dir:node:${remoteNodeId}`, trimmed)
        } catch {}
        await apiClient.post(`/library/servers/${remoteNodeId}/desktop`, { gamesInstallPath: trimmed })
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ gamesInstallPath: trimmed })
        }
        try {
          localStorage.setItem('otix:games-install-dir', trimmed)
        } catch {}
      }

      // Automatically register in scanPaths if not already present
      if (trimmed) {
        const exists = scanPaths.some((p) => p.path === trimmed && p.type === 'game')
        if (!exists) {
          const updated = [...scanPaths, { path: trimmed, type: 'game' as const }]
          await persistScanPaths(updated)
        }
      }

      toast({
        title: 'Installation Directory Updated',
        description: `Saved: ${trimmed || 'Not configured'}`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not save game installation directory.',
        variant: 'error',
      })
    }
  }

  // ── 4. Games Download Directory Handler ──
  const handleSaveGamesPath = async (path: string) => {
    const trimmed = path.trim()
    setGamesDownloadPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          localStorage.setItem(`otix:games-download-dir:node:${remoteNodeId}`, trimmed)
        } catch {}
        await apiClient.post(`/library/servers/${remoteNodeId}/desktop`, { gamesDownloadPath: trimmed })
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ gamesDownloadPath: trimmed })
        }
        try {
          localStorage.setItem('otix:games-download-dir', trimmed)
        } catch {}
      }

      // Automatically register in scanPaths if not already present
      if (trimmed) {
        const exists = scanPaths.some((p) => p.path === trimmed && p.type === 'game')
        if (!exists) {
          const updated = [...scanPaths, { path: trimmed, type: 'game' as const }]
          await persistScanPaths(updated)
        }
      }

      toast({
        title: 'Games Directory Updated',
        description: `Saved: ${trimmed || 'System default (~/Downloads/Games)'}`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Save Failed',
        description: 'Could not save games directory.',
        variant: 'error',
      })
    }
  }

  // ── 5. ISOs Directory Handler ──
  const handleSaveServerIsoPath = async (path: string) => {
    const trimmed = path.trim()
    setServerDownloadPath(trimmed)

    try {
      if (remoteNodeId) {
        try {
          localStorage.setItem(`otix:iso-download-dir:node:${remoteNodeId}`, trimmed)
        } catch {}
        await apiClient.post(`/library/servers/${remoteNodeId}/organize`, { isoDownloadPath: trimmed || '' })
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.setDesktopSettings) {
          await api.setDesktopSettings({ isoDownloadPath: trimmed })
        }
        try {
          localStorage.setItem('otix:iso-download-dir', trimmed)
        } catch {}

        if (user && saveConfig && dlConfig) {
          try {
            await saveConfig({
              ...dlConfig,
              userId: user.id,
              downloadPath: trimmed || null,
            })
          } catch {}
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

      toast({
        title: 'ISO Directory Updated',
        description: `Saved: ${trimmed || 'Not configured'}`,
        variant: 'success',
      })
    } catch (err) {
      console.error('Failed to save ISO path:', err)
      toast({
        title: 'Save Failed',
        description: 'Could not save ISO directory.',
        variant: 'error',
      })
    }
  }

  // ── 5. Add Scan Path (each on its own separate line) ──
  const handleAddScanPath = async (pathToAdd: string, typeToAdd: 'game' | 'iso') => {
    const p = pathToAdd.trim()
    if (!p) return

    if (scanPaths.some((item) => item.path === p && item.type === typeToAdd)) {
      toast({
        title: 'Path Already Monitored',
        description: `This directory is already configured as a ${typeToAdd === 'iso' ? 'disc' : 'game'} scan path.`,
        variant: 'warning',
      })
      return
    }

    try {
      const updated = [...scanPaths, { path: p, type: typeToAdd }]
      await persistScanPaths(updated)
      setDraftScanPath('')
      toast({
        title: 'Scan Path Added',
        description: `Added ${p} to monitored scan paths.`,
        variant: 'success',
      })
    } catch (err) {
      console.error('Failed to add scan path:', err)
      toast({
        title: 'Add Failed',
        description: `Could not add ${p}.`,
        variant: 'error',
      })
    }
  }

  const handleCommitDraftScanPath = async (path: string) => {
    await handleAddScanPath(path, draftScanType)
  }

  const handleRemoveScanPath = async (itemToRemove: ScanPathItem) => {
    try {
      const updated = scanPaths.filter((item) => !(item.path === itemToRemove.path && item.type === itemToRemove.type))
      await persistScanPaths(updated)
      toast({
        title: 'Path Removed',
        description: `Removed ${itemToRemove.path}.`,
        variant: 'default',
      })
    } catch (err) {
      console.error('Failed to remove scan path:', err)
      toast({
        title: 'Remove Failed',
        description: `Could not remove ${itemToRemove.path}.`,
        variant: 'error',
      })
    }
  }

  // ── 6. Trigger Scan ──
  const handleTriggerScan = async () => {
    setIsScanning(true)
    try {
      if (remoteNodeId) {
        await apiClient.post(`/library/servers/${remoteNodeId}/scan`)
      } else {
        const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)
        if (api?.scanPaths) {
          const gameDirs = scanPaths.filter((p) => p.type === 'game').map((p) => p.path)
          const isoDirs = scanPaths.filter((p) => p.type === 'iso').map((p) => p.path)
          await api.scanPaths(gameDirs, isoDirs)
        }
      }
      onScanComplete?.()
      toast({
        title: 'Library Scanned',
        description: 'Completed scanning configured library and download paths.',
        variant: 'success',
      })
    } catch (err) {
      console.error('Library scan failed:', err)
      toast({
        title: 'Scan Failed',
        description: 'Failed to scan paths.',
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div id="paths" className={cn('space-y-6 scroll-mt-28', className)}>
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Destinations"
          description="Where Otix saves downloads. Browse or press Enter to save — folders are watched for scanning automatically."
        />

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <HardDrive size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white">Game installation folder</span>
                <p className="text-[11px] text-white/40">Where installed games live. Target directory for game installers.</p>
              </div>
            </div>
            <PathInput
              value={gamesInstallPath}
              onChange={setGamesInstallPath}
              onCommit={handleSaveGamesInstallPath}
              placeholder={desktop && !remoteNodeId ? 'e.g. C:\\Games or /Games' : 'e.g. /media/installed-games'}
              target={folderTarget}
              serverId={remoteNodeId ?? undefined}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                <Gamepad2 size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white">Games download folder</span>
                <p className="text-[11px] text-white/40">Where game installers are downloaded before installation.</p>
              </div>
            </div>
            <PathInput
              value={gamesDownloadPath}
              onChange={setGamesDownloadPath}
              onCommit={handleSaveGamesPath}
              placeholder={desktop && !remoteNodeId ? 'e.g. D:\\Downloads\\Games or ~/Downloads/Games' : 'e.g. /media/downloads/games'}
              target={folderTarget}
              serverId={remoteNodeId ?? undefined}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Disc size={16} />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white">ISOs &amp; disc images</span>
                <p className="text-[11px] text-white/40">Target for completed ISO files and ROMs.</p>
              </div>
            </div>
            <PathInput
              value={serverDownloadPath}
              onChange={setServerDownloadPath}
              onCommit={handleSaveServerIsoPath}
              placeholder={desktop && !remoteNodeId ? 'e.g. D:\\ISOs or /Volumes/Storage/ISOs' : 'e.g. /app/storage/installers'}
              target={folderTarget}
              serverId={remoteNodeId ?? undefined}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Scan folders"
          description={
            backendNode
              ? 'Folders stored on the Otix backend. Scanning needs a worker node with those paths on disk.'
              : 'Extra folders to index. Destinations above are linked automatically.'
          }
          action={
            backendNode ? undefined : (
            <DkButton
              size="sm"
              onClick={handleTriggerScan}
              disabled={isScanning}
              loading={isScanning}
              className="h-8 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </DkButton>
            )
          }
        />

        <div className="space-y-1.5">
          {scanPaths.map((item, idx) => {
            const isLinkedDestination =
              (item.type === 'game' && (item.path === gamesDownloadPath || item.path === gamesInstallPath)) ||
              (item.type === 'iso' && item.path === serverDownloadPath)
            return (
              <div
                key={`${item.path}-${item.type}-${idx}`}
                className="px-3.5 py-2 rounded-xl bg-white/[0.03] text-xs font-mono text-white/80 flex items-center justify-between gap-3 border border-white/5"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold uppercase tracking-wider shrink-0',
                      item.type === 'iso'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                        : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20',
                    )}
                  >
                    {item.type === 'iso' ? <Disc size={11} /> : <Gamepad2 size={11} />}
                    {item.type === 'iso' ? 'ISO' : 'Game'}
                  </div>
                  {isLinkedDestination && (
                    <span className="text-[10px] font-sans font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                      Destination
                    </span>
                  )}
                  <FolderOpen size={14} className="text-primary shrink-0" />
                  <span className="truncate">{item.path}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveScanPath(item)}
                  className="h-6 w-6 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                  title="Remove path"
                  aria-label="Remove path"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}

          <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-dashed border-white/10 space-y-2.5">
            <div className="flex items-center gap-2">
              <div
                className="inline-flex rounded-lg bg-white/5 p-0.5 shrink-0"
                role="group"
                aria-label="Scan folder type"
              >
                <button
                  type="button"
                  onClick={() => setDraftScanType('game')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer',
                    draftScanType === 'game'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-white/40 hover:text-white/70',
                  )}
                  aria-pressed={draftScanType === 'game'}
                >
                  <Gamepad2 size={11} />
                  Game
                </button>
                <button
                  type="button"
                  onClick={() => setDraftScanType('iso')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer',
                    draftScanType === 'iso'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-white/40 hover:text-white/70',
                  )}
                  aria-pressed={draftScanType === 'iso'}
                >
                  <Disc size={11} />
                  ISO
                </button>
              </div>
              <span className="text-[11px] text-white/40 truncate">
                {scanPaths.length === 0 ? 'Add a folder to scan' : 'Add another folder'}
              </span>
            </div>
            <PathInput
              compact
              commitOnBlur={false}
              value={draftScanPath}
              onChange={setDraftScanPath}
              onCommit={handleCommitDraftScanPath}
              placeholder={
                desktop && !remoteNodeId
                  ? draftScanType === 'iso'
                    ? 'e.g. D:\\ISOs or /Volumes/Storage/ROMs'
                    : 'e.g. D:\\Games\\Steam or ~/Games'
                  : draftScanType === 'iso'
                    ? 'e.g. /media/isos'
                    : 'e.g. /media/games'
              }
              target={folderTarget}
              serverId={remoteNodeId ?? undefined}
            />
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
