import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import { AuthContext } from '@/features/auth/hooks/use-auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { getDesktopAPI, type DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useSettingsNode } from '../context/settings-node-context'
import { isLocalDesktopNodeId } from '../local-desktop-node'
import { useSettingsSaveBar } from '../context/settings-save-context'
import { ISO_FOLDER_PRESETS } from '../utils/naming-template'
import {
  SCAN_ON_LAUNCH_KEY,
  readScanOnLaunch,
  getPresetSamplePreview,
  loadStoredDirectoryRules,
  saveStoredDirectoryRules,
  buildDirectoryOptions,
  resolveDirectoryTemplate,
  type DirectoryRulesMap,
} from '../utils/organize'

export interface UseOrganizeSettingsOptions {
  nodeId?: number | null
}

export const useOrganizeSettings = ({ nodeId: nodeIdProp }: UseOrganizeSettingsOptions = {}) => {
  const auth = useContext(AuthContext)
  const user = auth?.user as { id: string } | null

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode, servers } = useSettingsNode()
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const isGlobalProfile = nodeId === 0
  const remoteNodeId = isLocalDesktopNodeId(nodeId) || isGlobalProfile ? null : nodeId

  const [reloadNonce, setReloadNonce] = useState(0)
  const refreshSettings = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [allowHypervisor, setAllowHypervisor] = useState(false)
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [baseNamingTemplate, setBaseNamingTemplate] = useState(ISO_FOLDER_PRESETS[0].template)
  const [isoDownloadPath, setIsoDownloadPath] = useState('')
  const [preferredRepackers, setPreferredRepackers] = useState('')
  const [scanOnLaunch, setScanOnLaunch] = useState(readScanOnLaunch)
  const [nodeLoaded, setNodeLoaded] = useState(false)
  const [loadedSnap, setLoadedSnap] = useState('')
  const [testRunOpen, setTestRunOpen] = useState(false)

  // Directory-specific organization rules state
  const [selectedDirectory, setSelectedDirectory] = useState<string>('all')
  const [directoryRules, setDirectoryRules] = useState<DirectoryRulesMap>(() => loadStoredDirectoryRules(nodeId))
  const [availableScanPaths, setAvailableScanPaths] = useState<Array<{ path: string; type?: string }>>([])

  const templateInputRef = useRef<HTMLInputElement>(null)

  // Fetch available library paths for this node to populate directory dropdown
  useEffect(() => {
    let cancelled = false

    if (remoteNodeId) {
      apiClient
        .get<any>(`/library/servers/${remoteNodeId}/libraries`)
        .then((res) => {
          if (cancelled) return
          const rows = Array.isArray(res?.data) ? res.data : res?.data?.libraries || []
          setAvailableScanPaths(
            rows.map((r: any) => ({
              path: String(r.path || '').trim(),
              type: r.kind || r.type || 'game',
            })).filter((r: { path: string }) => r.path),
          )
        })
        .catch(() => {
          // ignore error
        })
    } else {
      const api = getDesktopAPI()
      if (api?.getScanPaths) {
        api.getScanPaths().then((raw) => {
          if (cancelled) return
          if (Array.isArray(raw)) {
            setAvailableScanPaths(
              raw.map((p) => ({ path: p.path, type: p.type || 'game' })).filter((r) => r.path),
            )
          }
        }).catch(() => {
          // ignore
        })
      } else {
        try {
          const games = JSON.parse(localStorage.getItem('otix:scan-paths') || '[]')
          const isos = JSON.parse(localStorage.getItem('otix:iso-scan-paths') || '[]')
          setAvailableScanPaths([
            ...(Array.isArray(games) ? games.map((p: string) => ({ path: p, type: 'game' })) : []),
            ...(Array.isArray(isos) ? isos.map((p: string) => ({ path: p, type: 'iso' })) : []),
          ])
        } catch {
          setAvailableScanPaths([])
        }
      }
    }

    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

  useEffect(() => {
    if (!remoteNodeId) {
      setNodeLoaded(false)
      return
    }
    let cancelled = false
    apiClient
      .get<Record<string, unknown>>(`/library/servers/${remoteNodeId}/organize`)
      .then((res) => {
        const data = res?.data
        if (cancelled || !data) return
        setAutoSearch(Boolean(data.autoSearchWishlist))
        setIntervalHours(Number(data.wishlistIntervalHours || 12))
        setAllowHypervisor(Boolean(data.allowHypervisor))
        setAutoOrganizeEnabled(Boolean(data.autoOrganizeEnabled))
        setPostProcessEnabled((data.postProcessEnabled ?? true) as boolean)
        const template = (data.namingTemplate ?? ISO_FOLDER_PRESETS[0].template) as string
        setBaseNamingTemplate(template)
        setIsoDownloadPath((data.isoDownloadPath ?? '') as string)
        setPreferredRepackers((data.preferredRepackers ?? '') as string)

        const rawRules = data.directoryRules as DirectoryRulesMap | undefined
        if (rawRules && typeof rawRules === 'object') {
          setDirectoryRules(rawRules)
          saveStoredDirectoryRules(rawRules, remoteNodeId)
        }

        if (typeof data.scanOnLaunch === 'boolean') {
          setScanOnLaunch(Boolean(data.scanOnLaunch))
        }
        setNodeLoaded(true)
        setLoadedSnap(
          JSON.stringify({
            autoSearch: Boolean(data.autoSearchWishlist),
            intervalHours: Number(data.wishlistIntervalHours || 12),
            allowHypervisor: Boolean(data.allowHypervisor),
            autoOrganizeEnabled: Boolean(data.autoOrganizeEnabled),
            postProcessEnabled: data.postProcessEnabled ?? true,
            namingTemplate: template,
            isoDownloadPath: data.isoDownloadPath ?? '',
            preferredRepackers: data.preferredRepackers ?? '',
            scanOnLaunch: Boolean(data.scanOnLaunch),
            directoryRules: rawRules || {},
          }),
        )
      })
      .catch(() => {
        if (!cancelled) setNodeLoaded(false)
      })
    return () => {
      cancelled = true
    }
  }, [remoteNodeId, reloadNonce])

  useEffect(() => {
    if (remoteNodeId || !dlConfig) return
    setAutoSearch(dlConfig.autoSearchWishlist ?? false)
    setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
    setAllowHypervisor(dlConfig.allowHypervisor ?? false)
    setAutoOrganizeEnabled(dlConfig.autoOrganizeEnabled ?? false)
    setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
    const template = dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template
    setBaseNamingTemplate(template)
    setPreferredRepackers(dlConfig.preferredRepackers ?? '')
  }, [dlConfig, remoteNodeId, reloadNonce])

  useEffect(() => {
    if (remoteNodeId || isGlobalProfile) return
    const api = getDesktopAPI()
    if (!api?.getDesktopSettings) return
    api.getDesktopSettings().then((ds: DesktopSettingsData) => {
      if (typeof ds?.scanOnLaunch === 'boolean') {
        setScanOnLaunch(ds.scanOnLaunch)
        try {
          localStorage.setItem(SCAN_ON_LAUNCH_KEY, String(ds.scanOnLaunch))
        } catch {
          // ignore localStorage error
        }
      }
      if (typeof ds?.isoDownloadPath === 'string') {
        setIsoDownloadPath(ds.isoDownloadPath)
      }
    }).catch(() => {
      // ignore
    })
  }, [remoteNodeId, isGlobalProfile, reloadNonce])

  // Resolve active template and preset for currently selected directory
  const currentDirResolution = resolveDirectoryTemplate(
    selectedDirectory,
    baseNamingTemplate,
    directoryRules,
  )
  const activeTemplate = currentDirResolution.template
  const activePresetId = currentDirResolution.presetId
  const isCustomRuleActive = currentDirResolution.isCustomRule

  const handleUpdateTemplate = (nextTemplate: string, nextPresetId?: string) => {
    const match = ISO_FOLDER_PRESETS.find((p) => p.template === nextTemplate)
    const effectivePresetId = nextPresetId ?? (match?.id ?? 'custom')

    if (selectedDirectory === 'all') {
      setBaseNamingTemplate(nextTemplate)
    } else {
      setDirectoryRules((prev) => {
        const next = {
          ...prev,
          [selectedDirectory]: {
            ...prev[selectedDirectory],
            namingTemplate: nextTemplate,
            presetId: effectivePresetId,
          },
        }
        saveStoredDirectoryRules(next, nodeId)
        return next
      })
    }
  }

  const handleResetDirectoryToDefault = () => {
    if (selectedDirectory === 'all') return
    setDirectoryRules((prev) => {
      const next = { ...prev }
      delete next[selectedDirectory]
      saveStoredDirectoryRules(next, nodeId)
      return next
    })
  }

  const handleSave = useCallback(async () => {
    if (remoteNodeId) {
      await apiClient.post(`/library/servers/${remoteNodeId}/organize`, {
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        namingTemplate: baseNamingTemplate || '',
        isoDownloadPath: isoDownloadPath.trim(),
        preferredRepackers: preferredRepackers.trim(),
        scanOnLaunch,
        directoryRules,
      })
      saveStoredDirectoryRules(directoryRules, remoteNodeId)
      setLoadedSnap(
        JSON.stringify({
          autoSearch,
          intervalHours,
          allowHypervisor,
          autoOrganizeEnabled,
          postProcessEnabled,
          namingTemplate: baseNamingTemplate,
          isoDownloadPath: isoDownloadPath.trim(),
          preferredRepackers,
          scanOnLaunch,
          directoryRules,
        }),
      )
      return
    }

    if (user) {
      await saveConfig({
        ...(dlConfig ?? {
          userId: user.id,
          sabnzbdHost: null,
          sabnzbdPort: null,
          sabnzbdApiKey: null,
          sabnzbdUseSsl: false,
          nzbplanetApiKey: null,
          sabnzbdCompletePath: null,
          downloadPath: null,
          postProcessEnabled: false,
          autoSearchWishlist: false,
          wishlistIntervalHours: 24,
        }),
        userId: user.id,
        downloadPath: dlConfig?.downloadPath ?? null,
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        namingTemplate: baseNamingTemplate || null,
        preferredRepackers: preferredRepackers.trim() || null,
      })
    }

    saveStoredDirectoryRules(directoryRules, nodeId)

    if (!isGlobalProfile) {
      try {
        localStorage.setItem(SCAN_ON_LAUNCH_KEY, String(scanOnLaunch))
      } catch {
        // ignore
      }
    }

    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      await api.setDesktopSettings({ scanOnLaunch, isoDownloadPath: isoDownloadPath.trim() }).catch(() => {
        // ignore
      })
    } else if (api && 'saveDesktopSettings' in api) {
      const current = (await api.getDesktopSettings?.().catch(() => ({}))) || {}
      const saveSettingsFn = (api as unknown as { saveDesktopSettings: (v: unknown) => Promise<unknown> })
        .saveDesktopSettings
      await saveSettingsFn({
        ...current,
        scanOnLaunch,
        isoDownloadPath: isoDownloadPath.trim(),
      }).catch(() => {
        // ignore
      })
    }
  }, [
    user,
    saveConfig,
    dlConfig,
    postProcessEnabled,
    autoSearch,
    intervalHours,
    allowHypervisor,
    autoOrganizeEnabled,
    baseNamingTemplate,
    isoDownloadPath,
    preferredRepackers,
    scanOnLaunch,
    directoryRules,
    remoteNodeId,
    isGlobalProfile,
    nodeId,
  ])

  const handleDiscard = useCallback(() => {
    if (remoteNodeId && loadedSnap) {
      try {
        const snap = JSON.parse(loadedSnap) as {
          autoSearch: boolean
          intervalHours: number
          allowHypervisor: boolean
          autoOrganizeEnabled: boolean
          postProcessEnabled: boolean
          namingTemplate: string
          isoDownloadPath: string
          preferredRepackers: string
          scanOnLaunch: boolean
          directoryRules?: DirectoryRulesMap
        }
        setAutoSearch(snap.autoSearch)
        setIntervalHours(snap.intervalHours)
        setAllowHypervisor(snap.allowHypervisor)
        setAutoOrganizeEnabled(snap.autoOrganizeEnabled)
        setPostProcessEnabled(snap.postProcessEnabled)
        setBaseNamingTemplate(snap.namingTemplate)
        setIsoDownloadPath(snap.isoDownloadPath || '')
        setPreferredRepackers(snap.preferredRepackers)
        setScanOnLaunch(snap.scanOnLaunch)
        setDirectoryRules(snap.directoryRules || {})
      } catch {
        // ignore invalid snapshot
      }
      return
    }
    if (dlConfig) {
      setAutoSearch(dlConfig.autoSearchWishlist ?? false)
      setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
      setAllowHypervisor(dlConfig.allowHypervisor ?? false)
      setAutoOrganizeEnabled(dlConfig.autoOrganizeEnabled ?? false)
      setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
      const fallbackTmpl = dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template
      setBaseNamingTemplate(fallbackTmpl)
      setPreferredRepackers(dlConfig.preferredRepackers ?? '')
      setDirectoryRules(loadStoredDirectoryRules(nodeId))
    }
    setScanOnLaunch(readScanOnLaunch())
  }, [dlConfig, loadedSnap, remoteNodeId, nodeId])

  const hasChanges = remoteNodeId
    ? nodeLoaded &&
      JSON.stringify({
        autoSearch,
        intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        postProcessEnabled,
        namingTemplate: baseNamingTemplate,
        isoDownloadPath: isoDownloadPath.trim(),
        preferredRepackers,
        scanOnLaunch,
        directoryRules,
      }) !== loadedSnap
    : Boolean(
        dlConfig &&
          (autoSearch !== (dlConfig.autoSearchWishlist ?? false) ||
            intervalHours !== (dlConfig.wishlistIntervalHours ?? 12) ||
            allowHypervisor !== (dlConfig.allowHypervisor ?? false) ||
            autoOrganizeEnabled !== (dlConfig.autoOrganizeEnabled ?? false) ||
            postProcessEnabled !== (dlConfig.postProcessEnabled ?? true) ||
            baseNamingTemplate !== (dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template) ||
            preferredRepackers !== (dlConfig.preferredRepackers ?? '') ||
            scanOnLaunch !== readScanOnLaunch() ||
            JSON.stringify(directoryRules) !== JSON.stringify(loadStoredDirectoryRules(nodeId))),
      )

  useSettingsSaveBar({
    hasChanges,
    onSave: handleSave,
    onDiscard: handleDiscard,
    label: 'Save library settings',
  })

  const handleInsertToken = (token: string) => {
    const input = templateInputRef.current
    if (!input) {
      handleUpdateTemplate(`${activeTemplate}${token}`, 'custom')
      return
    }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const next = input.value.slice(0, start) + token + input.value.slice(end)
    handleUpdateTemplate(next, 'custom')
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  const liveSamplePreview = getPresetSamplePreview(activeTemplate)
  const directoryDropdownOptions = buildDirectoryOptions(availableScanPaths, isoDownloadPath)

  // Count how many directories have custom override rules (Phase 5 helper)
  const customRulesCount = Object.keys(directoryRules).filter(
    (k) => directoryRules[k]?.namingTemplate && directoryRules[k].namingTemplate !== baseNamingTemplate,
  ).length

  return {
    // State
    autoSearch,
    intervalHours,
    allowHypervisor,
    autoOrganizeEnabled,
    postProcessEnabled,
    baseNamingTemplate,
    isoDownloadPath,
    preferredRepackers,
    scanOnLaunch,
    testRunOpen,
    selectedDirectory,
    directoryRules,
    availableScanPaths,
    customRulesCount,

    // Setters
    setAutoSearch,
    setIntervalHours,
    setAllowHypervisor,
    setAutoOrganizeEnabled,
    setPostProcessEnabled,
    setIsoDownloadPath,
    setPreferredRepackers,
    setScanOnLaunch,
    setTestRunOpen,
    setSelectedDirectory,

    // Computed
    activeTemplate,
    activePresetId,
    isCustomRuleActive,
    liveSamplePreview,
    directoryDropdownOptions,

    // Handlers
    handleUpdateTemplate,
    handleResetDirectoryToDefault,
    handleInsertToken,
    refreshSettings,

    // Refs
    templateInputRef,

    // Context & IDs
    remoteNodeId,
    isGlobalProfile,
    nodeId,
    servers,
    dlConfig,
    saveConfig,
  }
}
