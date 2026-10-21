import { useState, useEffect, useCallback, useRef, useContext } from 'react'
import {
  Play,
  Search,
  Sparkles,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { AuthContext } from '@/features/auth/hooks/use-auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { getDesktopAPI, type DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { PathInput } from '@/components/path-picker'
import { useSettingsNode } from '../../context/settings-node-context'
import { isLocalDesktopNodeId } from '../../local-desktop-node'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { useSettingsSaveBar } from '../../context/settings-save-context'
import { TokenizedTemplateDisplay } from '../molecules/tokenized-template-display'
import { OrganizeTestRunModal } from './organize-test-run-modal'
import {
  ISO_FOLDER_PRESETS,
  TOKEN_COLOR_MAP,
  SAMPLE_RELEASES,
  formatTemplateSample,
} from '../../utils/naming-template'
import { cn } from '@/lib/utils'
import { SCAN_ON_LAUNCH_KEY, readScanOnLaunch } from '../../utils/organize'

export const SettingsOrganizeSection = ({ nodeId: nodeIdProp }: { nodeId?: number | null } = {}) => {
  const auth = useContext(AuthContext)
  const user = auth?.user as { id: string } | null

  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { selectedNode } = useSettingsNode()
  const nodeId = nodeIdProp !== undefined ? nodeIdProp : (selectedNode?.id ?? null)
  const remoteNodeId = isLocalDesktopNodeId(nodeId) ? null : nodeId

  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [allowHypervisor, setAllowHypervisor] = useState(false)
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [namingTemplate, setNamingTemplate] = useState(ISO_FOLDER_PRESETS[0].template)
  const [isoDownloadPath, setIsoDownloadPath] = useState('')
  const [presetId, setPresetId] = useState('standard')
  const [preferredRepackers, setPreferredRepackers] = useState('')
  const [scanOnLaunch, setScanOnLaunch] = useState(readScanOnLaunch)
  const [nodeLoaded, setNodeLoaded] = useState(false)
  const [loadedSnap, setLoadedSnap] = useState('')
  const [testRunOpen, setTestRunOpen] = useState(false)

  const templateInputRef = useRef<HTMLInputElement>(null)

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
        setAutoSearch(Boolean(data.autoSearchWishlist ?? data.auto_search_wishlist))
        setIntervalHours(Number(data.wishlistIntervalHours ?? data.wishlist_interval_hours ?? 12) || 12)
        setAllowHypervisor(Boolean(data.allowHypervisor ?? data.allow_hypervisor))
        setAutoOrganizeEnabled(Boolean(data.autoOrganizeEnabled ?? data.auto_organize_enabled))
        setPostProcessEnabled(
          (data.postProcessEnabled ?? data.post_process_enabled ?? true) as boolean,
        )
        const template = (data.namingTemplate ?? data.naming_template ?? ISO_FOLDER_PRESETS[0].template) as string
        setNamingTemplate(template)
        setIsoDownloadPath((data.isoDownloadPath ?? data.iso_download_path ?? '') as string)
        setPreferredRepackers((data.preferredRepackers ?? data.preferred_repackers ?? '') as string)
        const match = ISO_FOLDER_PRESETS.find((p) => p.template === template)
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
            namingTemplate: template,
            isoDownloadPath: data.isoDownloadPath ?? data.iso_download_path ?? '',
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
    const template = dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template
    setNamingTemplate(template)
    setPreferredRepackers(dlConfig.preferredRepackers ?? '')
    const match = ISO_FOLDER_PRESETS.find((p) => p.template === template)
    setPresetId(match?.id ?? 'custom')
  }, [dlConfig, remoteNodeId])

  useEffect(() => {
    if (remoteNodeId) return
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
  }, [remoteNodeId])

  const handleSave = useCallback(async () => {
    if (remoteNodeId) {
      await apiClient.post(`/library/servers/${remoteNodeId}/organize`, {
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        allowHypervisor,
        autoOrganizeEnabled,
        namingTemplate: namingTemplate || '',
        isoDownloadPath: isoDownloadPath.trim(),
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
          isoDownloadPath: isoDownloadPath.trim(),
          preferredRepackers,
          scanOnLaunch,
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
        namingTemplate: namingTemplate || null,
        preferredRepackers: preferredRepackers.trim() || null,
      })
    }

    try {
      localStorage.setItem(SCAN_ON_LAUNCH_KEY, String(scanOnLaunch))
    } catch {
      // ignore
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
    namingTemplate,
    isoDownloadPath,
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
          isoDownloadPath: string
          preferredRepackers: string
          scanOnLaunch: boolean
        }
        setAutoSearch(snap.autoSearch)
        setIntervalHours(snap.intervalHours)
        setAllowHypervisor(snap.allowHypervisor)
        setAutoOrganizeEnabled(snap.autoOrganizeEnabled)
        setPostProcessEnabled(snap.postProcessEnabled)
        setNamingTemplate(snap.namingTemplate)
        setIsoDownloadPath(snap.isoDownloadPath || '')
        setPreferredRepackers(snap.preferredRepackers)
        setScanOnLaunch(snap.scanOnLaunch)
        const match = ISO_FOLDER_PRESETS.find((p) => p.template === snap.namingTemplate)
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
      const fallbackTmpl = dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template
      setNamingTemplate(fallbackTmpl)
      setPreferredRepackers(dlConfig.preferredRepackers ?? '')
      const match = ISO_FOLDER_PRESETS.find((p) => p.template === fallbackTmpl)
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
        isoDownloadPath: isoDownloadPath.trim(),
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
            namingTemplate !== (dlConfig.namingTemplate ?? ISO_FOLDER_PRESETS[0].template) ||
            preferredRepackers !== (dlConfig.preferredRepackers ?? '') ||
            scanOnLaunch !== readScanOnLaunch()),
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
      setNamingTemplate((prev) => `${prev}${token}`)
      setPresetId('custom')
      return
    }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const next = input.value.slice(0, start) + token + input.value.slice(end)
    setNamingTemplate(next)
    setPresetId('custom')
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  return (
    <div id="organize" className="space-y-6 scroll-mt-28">
      {/* ISO Directory & Folder Structure Card */}
      <SettingsCard className="space-y-5">
        <SectionHeader
          title="Folder Structure & ISO Library"
          description="Configure how your ISO game directory is structured, renamed, and organized."
          action={
            <DkButton
              size="sm"
              variant="primary"
              onClick={() => setTestRunOpen(true)}
              className="gap-1.5 font-bold cursor-pointer"
            >
              <Play size={12} className="fill-current" />
              <span>Test Run</span>
            </DkButton>
          }
        />

        {/* ISO Directory Picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground block">
            ISO File Directory
          </label>
          <p className="text-xs text-muted-foreground">
            The target library folder on this node where your organized ISO games are sorted and stored.
          </p>
          <div className="pt-1">
            <PathInput
              value={isoDownloadPath}
              onChange={setIsoDownloadPath}
              placeholder="e.g. D:\Games\ISOs or /media/games/iso"
              serverId={typeof nodeId === 'number' ? nodeId : undefined}
              confirmLabel="Set Directory"
            />
          </div>
        </div>

        {/* Folder Structure Presets */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground block">
              Folder Structure Presets
            </label>
            <span className="text-[11px] text-muted-foreground">Select a layout or build a custom template below</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ISO_FOLDER_PRESETS.map((preset) => {
              const isSelected = presetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setPresetId(preset.id)
                    setNamingTemplate(preset.template)
                  }}
                  className={cn(
                    'p-3 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5',
                    isSelected
                      ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10'
                      : 'bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="text-xs font-bold text-foreground tracking-tight">{preset.label}</span>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-[var(--dk-surface-raised)] text-muted-foreground',
                      )}
                    >
                      {preset.badge}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.description}</p>

                  <div className="pt-1 overflow-x-auto w-full">
                    <TokenizedTemplateDisplay template={preset.template} size="xs" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Template Input with Color-Coded Token Chips */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground block">
              Active Naming Template
            </label>
            <span className="text-[11px] text-muted-foreground font-mono">
              Use <code className="text-primary font-bold">/</code> for subfolders
            </span>
          </div>

          <input
            ref={templateInputRef}
            type="text"
            value={namingTemplate}
            onChange={(e) => {
              setNamingTemplate(e.target.value)
              setPresetId('custom')
            }}
            placeholder="{Title} ({Year})/{Title}.{ext}"
            className="w-full text-sm font-mono text-foreground outline-none h-10 rounded-xl bg-[var(--dk-surface-ghost)] px-3.5 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
          />

          {/* Color-Coded Token Chips for Cursor Insertion */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Click tokens to insert at cursor:
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(TOKEN_COLOR_MAP).map(([key, def]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleInsertToken(def.token)}
                  title={`${def.description} (e.g. "${def.example}")`}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95',
                    def.colorClass,
                    def.bgClass,
                  )}
                >
                  <span>{def.token}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Interactive Preview Box */}
          <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" />
                <span>Live Sample Previews</span>
              </span>
              <span className="text-[11px] text-muted-foreground">Real-time template transformation</span>
            </div>

            <div className="space-y-1.5 pt-1">
              {SAMPLE_RELEASES.slice(0, 2).map((sample, sIdx) => {
                const formatted = formatTemplateSample(namingTemplate, sample)
                return (
                  <div key={sIdx} className="p-2 rounded-xl bg-[var(--dk-surface-raised)] space-y-1">
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      Release: {sample.originalName}.{sample.ext}
                    </p>
                    <p className="text-xs font-mono font-semibold text-emerald-500 dark:text-emerald-400 break-all">
                      &rarr; {formatted}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Auto-Organize Switch */}
        <div className="pt-2">
          <SettingsRow
            icon={<Sparkles className="h-5 w-5" />}
            label="Auto-organize"
            description="Automatically rename and sort downloaded games into organized folders according to the template above."
            action={<DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />}
          />
        </div>
      </SettingsCard>

      {/* Automation Card */}
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
            <label className="text-xs font-medium text-muted-foreground">Interval (hours)</label>
            <input
              type="number"
              value={intervalHours}
              onChange={(e) => setIntervalHours(parseInt(e.target.value, 10) || 12)}
              min={1}
              max={168}
              className="mt-1 h-9 rounded-lg px-3 text-sm outline-none text-foreground focus:ring-2 focus:ring-primary/40"
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

      {/* Release Preferences Card */}
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Release preferences"
          description="Bias automatic picks toward preferred release groups."
        />
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Preferred repackers</label>
          <input
            type="text"
            value={preferredRepackers}
            onChange={(e) => setPreferredRepackers(e.target.value)}
            placeholder="e.g. FitGirl, DODI, ElAmigos"
            className="w-full text-sm text-foreground outline-none h-9 rounded-xl bg-[var(--dk-surface-ghost)] px-3 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Comma-separated. Used when auto-picking search results.</p>
        </div>
        <details className="pt-1">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
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

      {/* Test Run Dry-Run Modal */}
      {testRunOpen && (
        <OrganizeTestRunModal
          open={testRunOpen}
          onOpenChange={setTestRunOpen}
          nodeId={remoteNodeId}
          template={namingTemplate}
          isoDirectory={isoDownloadPath}
        />
      )}
    </div>
  )
};
