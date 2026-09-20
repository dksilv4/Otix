import { useState, useEffect, useCallback } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { useAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { getDesktopAPI } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useSettingsNode } from '../../context/settings-node-context'
import { isLocalDesktopNodeId } from '../../local-desktop-node'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { useSettingsSaveBar } from '../../context/settings-save-context'

const NAMING_PRESETS = [
  { id: 'standard', label: 'Standard', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
  { id: 'simple', label: 'Simple', template: '{Title}/{OriginalName}.{ext}' },
]

const TOKEN_DOCS = [
  '{Title}        — Clean game title (e.g. "Stellar Blade")',
  '{CleanTitle}   — cleanGameTitle() fallback',
  '{Year}        — Release year (e.g. "2024")',
  '{Edition}     — Edition tag (e.g. "GOTY Edition")',
  '{Platform}    — Platform hint (e.g. "PC", "Multi")',
  '{ReleaseGroup}— Scene release group (e.g. "ElAmigos")',
  '{Version}     — Version number (e.g. "1.03")',
  '{OriginalName}— Raw download folder name',
  '{MediaType}   — "ISO", "PC", or "Update"',
  '{ext}         — File extension (auto-filled)',
]

const SCAN_ON_LAUNCH_KEY = 'otix:scan-on-launch'

function readScanOnLaunch(): boolean {
  try {
    return localStorage.getItem(SCAN_ON_LAUNCH_KEY) === 'true'
  } catch {
    return false
  }
}

export function SettingsOrganizeSection({ nodeId: nodeIdProp }: { nodeId?: number | null } = {}) {
  let user: { id: string } | null = null
  try {
    user = useAuth().user as { id: string } | null
  } catch {
    // Outside AuthProvider
  }

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode } = useSettingsNode()
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const remoteNodeId = isLocalDesktopNodeId(nodeId) ? null : nodeId

  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [allowHypervisor, setAllowHypervisor] = useState(false)
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template)
  const [presetId, setPresetId] = useState('standard')
  const [preferredRepackers, setPreferredRepackers] = useState('')
  const [scanOnLaunch, setScanOnLaunch] = useState(readScanOnLaunch)
  const [nodeLoaded, setNodeLoaded] = useState(false)
  const [loadedSnap, setLoadedSnap] = useState('')

  useEffect(() => {
    if (!remoteNodeId) {
      setNodeLoaded(false)
      return
    }
    let cancelled = false
    apiClient
      .get<any>(`/library/servers/${remoteNodeId}/organize`)
      .then((res) => {
        const data = res?.data
        if (cancelled || !data) return
        setAutoSearch(Boolean(data.autoSearchWishlist ?? data.auto_search_wishlist))
        setIntervalHours(Number(data.wishlistIntervalHours ?? data.wishlist_interval_hours ?? 12) || 12)
        setAllowHypervisor(Boolean(data.allowHypervisor ?? data.allow_hypervisor))
        setAutoOrganizeEnabled(Boolean(data.autoOrganizeEnabled ?? data.auto_organize_enabled))
        setPostProcessEnabled(data.postProcessEnabled ?? data.post_process_enabled ?? true)
        setNamingTemplate(data.namingTemplate ?? data.naming_template ?? NAMING_PRESETS[0].template)
        setPreferredRepackers(data.preferredRepackers ?? data.preferred_repackers ?? '')
        const template = data.namingTemplate ?? data.naming_template ?? NAMING_PRESETS[0].template
        const match = NAMING_PRESETS.find((p) => p.template === template)
        setPresetId(match?.id ?? 'custom')
        if (typeof (data.scanOnLaunch ?? data.scan_on_launch) === 'boolean') {
          setScanOnLaunch(Boolean(data.scanOnLaunch ?? data.scan_on_launch))
        }
        setNodeLoaded(true)
        setLoadedSnap(
          JSON.stringify({
            autoSearch: Boolean(data.autoSearchWishlist ?? data.auto_search_wishlist),
            intervalHours: Number(data.wishlistIntervalHours ?? data.wishlist_interval_hours ?? 12) || 12,
            allowHypervisor: Boolean(data.allowHypervisor ?? data.allow_hypervisor),
            autoOrganizeEnabled: Boolean(data.autoOrganizeEnabled ?? data.auto_organize_enabled),
            postProcessEnabled: data.postProcessEnabled ?? data.post_process_enabled ?? true,
            namingTemplate: data.namingTemplate ?? data.naming_template ?? NAMING_PRESETS[0].template,
            preferredRepackers: data.preferredRepackers ?? data.preferred_repackers ?? '',
            scanOnLaunch: Boolean(data.scanOnLaunch ?? data.scan_on_launch),
          }),
        )
      })
      .catch(() => {
        if (!cancelled) setNodeLoaded(false)
      })
    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

  useEffect(() => {
    if (remoteNodeId || !dlConfig) return
    setAutoSearch(dlConfig.autoSearchWishlist ?? false)
    setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
    setAllowHypervisor(dlConfig.allowHypervisor ?? false)
    setAutoOrganizeEnabled(dlConfig.autoOrganizeEnabled ?? false)
    setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
    setNamingTemplate(dlConfig.namingTemplate ?? NAMING_PRESETS[0].template)
    setPreferredRepackers(dlConfig.preferredRepackers ?? '')
    const match = NAMING_PRESETS.find((p) => p.template === (dlConfig.namingTemplate ?? NAMING_PRESETS[0].template))
    setPresetId(match?.id ?? 'custom')
  }, [dlConfig, remoteNodeId])

  useEffect(() => {
    if (remoteNodeId) return
    const api = getDesktopAPI()
    if (!api?.getDesktopSettings) return
    api.getDesktopSettings().then((ds: any) => {
      if (typeof ds?.scanOnLaunch === 'boolean') {
        setScanOnLaunch(ds.scanOnLaunch)
        try {
          localStorage.setItem(SCAN_ON_LAUNCH_KEY, String(ds.scanOnLaunch))
        } catch {}
      }
    }).catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    if (remoteNodeId) {
      await apiClient.post(`/library/servers/${remoteNodeId}/organize`, {
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        namingTemplate: namingTemplate || '',
        preferredRepackers: preferredRepackers.trim(),
        scanOnLaunch,
      })
      setLoadedSnap(
        JSON.stringify({
          autoSearch,
          intervalHours,
          allowHypervisor,
          autoOrganizeEnabled,
          postProcessEnabled,
          namingTemplate,
          preferredRepackers,
          scanOnLaunch,
        }),
      )
      return
    }

    if (user) {
      await saveConfig({
        userId: user.id,
        downloadPath: dlConfig?.downloadPath ?? null,
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        namingTemplate: namingTemplate || null,
        preferredRepackers: preferredRepackers.trim() || null,
      })
    }

    try {
      localStorage.setItem(SCAN_ON_LAUNCH_KEY, String(scanOnLaunch))
    } catch {}
    const api = getDesktopAPI()
    if (api?.setDesktopSettings) {
      await api.setDesktopSettings({ scanOnLaunch }).catch(() => {})
    } else if ((api as any)?.saveDesktopSettings) {
      const current = (await api.getDesktopSettings?.().catch(() => ({}))) || {}
      await (api as any).saveDesktopSettings({ ...current, scanOnLaunch }).catch(() => {})
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
    namingTemplate,
    preferredRepackers,
    scanOnLaunch,
    remoteNodeId,
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
          preferredRepackers: string
          scanOnLaunch: boolean
        }
        setAutoSearch(snap.autoSearch)
        setIntervalHours(snap.intervalHours)
        setAllowHypervisor(snap.allowHypervisor)
        setAutoOrganizeEnabled(snap.autoOrganizeEnabled)
        setPostProcessEnabled(snap.postProcessEnabled)
        setNamingTemplate(snap.namingTemplate)
        setPreferredRepackers(snap.preferredRepackers)
        setScanOnLaunch(snap.scanOnLaunch)
        const match = NAMING_PRESETS.find((p) => p.template === snap.namingTemplate)
        setPresetId(match?.id ?? 'custom')
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
      setNamingTemplate(dlConfig.namingTemplate ?? NAMING_PRESETS[0].template)
      setPreferredRepackers(dlConfig.preferredRepackers ?? '')
      const match = NAMING_PRESETS.find((p) => p.template === (dlConfig.namingTemplate ?? NAMING_PRESETS[0].template))
      setPresetId(match?.id ?? 'custom')
    }
    setScanOnLaunch(readScanOnLaunch())
  }, [dlConfig, loadedSnap, remoteNodeId])

  const hasChanges = remoteNodeId
    ? nodeLoaded &&
      JSON.stringify({
        autoSearch,
        intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        postProcessEnabled,
        namingTemplate,
        preferredRepackers,
        scanOnLaunch,
      }) !== loadedSnap
    : Boolean(
        dlConfig &&
          (autoSearch !== (dlConfig.autoSearchWishlist ?? false) ||
            intervalHours !== (dlConfig.wishlistIntervalHours ?? 12) ||
            allowHypervisor !== (dlConfig.allowHypervisor ?? false) ||
            autoOrganizeEnabled !== (dlConfig.autoOrganizeEnabled ?? false) ||
            postProcessEnabled !== (dlConfig.postProcessEnabled ?? true) ||
            namingTemplate !== (dlConfig.namingTemplate ?? NAMING_PRESETS[0].template) ||
            preferredRepackers !== (dlConfig.preferredRepackers ?? '') ||
            scanOnLaunch !== readScanOnLaunch()),
      )

  useSettingsSaveBar({
    hasChanges,
    onSave: handleSave,
    onDiscard: handleDiscard,
    label: 'Save library settings',
  })

  return (
    <div id="organize" className="space-y-6 scroll-mt-28">
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Automation"
          description="Wishlist scanning, post-processing, and library refresh."
        />
        <SettingsRow
          icon={<Search className="h-5 w-5" />}
          label="Auto-search wishlist"
          description={`Scan wishlist every ${intervalHours}h for new downloads`}
          action={<DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />}
        />
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-white/60">Interval (hours)</label>
            <input
              type="number"
              value={intervalHours}
              onChange={(e) => setIntervalHours(parseInt(e.target.value, 10) || 12)}
              min={1}
              max={168}
              className="mt-1 h-9 rounded-lg px-3 text-sm outline-none text-white/80 focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: 'var(--dk-surface-raised)', width: '120px' }}
            />
          </div>
        )}
        <SettingsRow
          label="Post-process after download"
          description="Extract, verify, and move completed downloads into your library paths."
          action={<DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />}
        />
        <SettingsRow
          label="Scan library on launch"
          description="Rescan configured folders when the selected node starts."
          action={<DkSwitch checked={scanOnLaunch} onCheckedChange={setScanOnLaunch} />}
        />
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Organization"
          description="How completed downloads are renamed and sorted into folders."
        />
        <SettingsRow
          icon={<Sparkles className="h-5 w-5" />}
          label="Auto-organize"
          description="Automatically rename and sort downloaded games into organized folders."
          action={<DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />}
        />
        <div>
          <label className="text-xs font-medium text-white/60 mb-2 block">Naming template</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {NAMING_PRESETS.map((p) => (
              <DkButton
                key={p.id}
                size="sm"
                variant={presetId === p.id ? 'primary' : 'ghost'}
                onClick={() => {
                  setPresetId(p.id)
                  setNamingTemplate(p.template)
                }}
              >
                {p.label}
              </DkButton>
            ))}
            <DkButton
              size="sm"
              variant={presetId === 'custom' ? 'primary' : 'ghost'}
              onClick={() => setPresetId('custom')}
            >
              Custom
            </DkButton>
          </div>
          <input
            type="text"
            value={namingTemplate}
            onChange={(e) => {
              setNamingTemplate(e.target.value)
              setPresetId('custom')
            }}
            className="w-full text-sm text-white outline-none h-9 rounded-xl bg-white/5 px-3 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)] placeholder:text-white/30"
          />
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors">
              Available tokens
            </summary>
            <div className="mt-2 space-y-1">
              {TOKEN_DOCS.map((doc) => (
                <p key={doc} className="text-[11px] font-mono text-white/30">
                  {doc}
                </p>
              ))}
            </div>
          </details>
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Release preferences"
          description="Bias automatic picks toward preferred release groups."
        />
        <div>
          <label className="text-xs font-medium text-white/60 mb-1.5 block">Preferred repackers</label>
          <input
            type="text"
            value={preferredRepackers}
            onChange={(e) => setPreferredRepackers(e.target.value)}
            placeholder="e.g. FitGirl, DODI, ElAmigos"
            className="w-full text-sm text-white outline-none h-9 rounded-xl bg-white/5 px-3 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)] placeholder:text-white/30"
          />
          <p className="mt-1.5 text-[11px] text-white/40">Comma-separated. Used when auto-picking search results.</p>
        </div>
        <details className="pt-1">
          <summary className="cursor-pointer text-xs font-medium text-white/50 hover:text-white/70">
            Advanced
          </summary>
          <div className="mt-3">
            <SettingsRow
              label="Allow hypervisor-tagged releases"
              description="Include releases tagged with HV/hypervisor/vm markers. Disabled by default."
              action={<DkSwitch checked={allowHypervisor} onCheckedChange={setAllowHypervisor} />}
            />
          </div>
        </details>
      </SettingsCard>
    </div>
  )
}
