import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw, FolderPlus, Download, Monitor, CheckCircle2, AlertCircle, Play } from 'lucide-react'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { hasDesktopAPI } from '@/lib/desktop/api'

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-white/40 mb-2 mt-4 first:mt-0">
      {title}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-3.5 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors group ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex flex-col gap-0.5 pr-4">
        <span className="text-sm font-medium text-white/90">{label}</span>
        <span className="text-xs text-white/50">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${checked ? 'bg-[oklch(0.705_0.213_47.604)]' : 'bg-white/20'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function SelectRow({
  value,
  onChange,
  label,
  description,
  options,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  description: string
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors cursor-pointer group">
      <div className="flex flex-col gap-0.5 pr-4">
        <span className="text-sm font-medium text-white/90">{label}</span>
        <span className="text-xs text-white/50">{description}</span>
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-white/[0.1] border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none cursor-pointer hover:border-white/30 transition-colors"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#141419] text-white">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function LauncherSettingsPage() {
  const navigate = useNavigate()
  const isDesktop = hasDesktopAPI()
  const { settings, update } = useLauncherSettings()

  // Desktop native settings
  const [desktopSettings, setDesktopSettings] = useState({
    launchOnStartup: false,
    minimizeToTray: false,
    closeToTray: false,
  })
  const [appVersion, setAppVersion] = useState<string>('0.3.0')
  const [updateStatus, setUpdateStatus] = useState<any>({ status: 'idle' })
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [scanPaths, setScanPaths] = useState<string[]>([])

  useEffect(() => {
    const api = window.desktopAPI as any
    if (!api) return

    // Load desktop settings
    api.getDesktopSettings?.().then((ds: any) => {
      if (ds) setDesktopSettings(ds)
    }).catch(() => {})

    // Load scan paths
    api.getScanPaths?.().then((paths: any[]) => {
      if (Array.isArray(paths)) {
        setScanPaths(paths.filter(p => p.type === 'game').map(p => p.path))
      }
    }).catch(() => {})

    // Load version & updater
    api.updater?.getVersion?.().then((v: string) => {
      if (v) setAppVersion(v)
    }).catch(() => {})

    const unbind = api.updater?.onStatusChanged?.((st: any) => {
      setUpdateStatus(st)
      if (st.status !== 'checking') setIsCheckingUpdate(false)
    })

    return () => {
      unbind?.()
    }
  }, [])

  const handleDesktopToggle = useCallback(async (key: 'launchOnStartup' | 'minimizeToTray' | 'closeToTray', val: boolean) => {
    const api = window.desktopAPI as any
    if (!api?.setDesktopSettings) return
    setDesktopSettings(prev => ({ ...prev, [key]: val }))
    try {
      await api.setDesktopSettings({ [key]: val })
    } catch {
      setDesktopSettings(prev => ({ ...prev, [key]: !val }))
    }
  }, [])

  const handleAddScanFolder = async () => {
    const api = window.desktopAPI as any
    if (!api?.selectScanFolder) return
    try {
      const selected = await api.selectScanFolder('game')
      if (selected) {
        setScanPaths(prev => Array.from(new Set([...prev, selected])))
      }
    } catch (err) {
      console.error('Failed to add scan folder:', err)
    }
  }

  const handleCheckUpdate = async () => {
    const api = window.desktopAPI as any
    if (!api?.updater?.checkForUpdates) return
    setIsCheckingUpdate(true)
    try {
      const res = await api.updater.checkForUpdates()
      if (res?.status === 'not-available') {
        setUpdateStatus({ status: 'not-available' })
        setIsCheckingUpdate(false)
      }
    } catch (err: any) {
      setUpdateStatus({ status: 'error', error: err?.message || 'Failed to check for updates' })
      setIsCheckingUpdate(false)
    }
  }

  const handleInstallUpdate = async () => {
    const api = window.desktopAPI as any
    if (api?.updater?.installUpdate) {
      await api.updater.installUpdate()
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0b0e]">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-6 pb-4 shrink-0 border-b border-white/[0.06]">
        <button
          onClick={() => navigate({ to: '/launcher/library', replace: true })}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div>
          <h1 className="text-lg font-black tracking-tight text-white">Launcher Settings</h1>
          <p className="text-xs text-white/40">Manage launcher behavior, game discovery, and desktop features</p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl flex flex-col gap-3">
          {/* General Display */}
          <SectionTitle title="Display & Interface" />

          <Toggle
            checked={settings.backgroundTransitions}
            onChange={v => update('backgroundTransitions', v)}
            label="Dynamic background transitions"
            description="Switch backdrop artwork dynamically based on selected screenshots and hovered games"
          />

          <SelectRow
            value={settings.defaultPage}
            onChange={v => update('defaultPage', v as 'library' | 'slide-picker')}
            label="Default landing view"
            description="Which view to open first when starting or navigating to the launcher"
            options={[
              { value: 'library', label: 'Library (Grid View)' },
              { value: 'slide-picker', label: 'Carousel (Hero Slider)' },
            ]}
          />

          {/* Desktop Integration */}
          {isDesktop && (
            <>
              <SectionTitle title="Desktop Behavior" />

              <Toggle
                checked={desktopSettings.launchOnStartup}
                onChange={v => handleDesktopToggle('launchOnStartup', v)}
                label="Launch on system startup"
                description="Automatically start Otix when you log into your operating system"
              />

              <Toggle
                checked={desktopSettings.minimizeToTray}
                onChange={v => handleDesktopToggle('minimizeToTray', v)}
                label="Minimize to system tray"
                description="Keep Otix running in the background tray when minimized"
              />

              <Toggle
                checked={desktopSettings.closeToTray}
                onChange={v => handleDesktopToggle('closeToTray', v)}
                label="Close to tray instead of quitting"
                description="Closing the window keeps the launcher and game detection active in the tray"
              />

              {/* Game Discovery */}
              <SectionTitle title="Game Discovery & Scanning" />

              <div className="py-3.5 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-white/90">Custom Scan Directories</span>
                    <span className="text-xs text-white/50">Folders scanned for standalone game installations and executables</span>
                  </div>
                  <button
                    onClick={handleAddScanFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    <FolderPlus size={14} />
                    <span>Add Folder</span>
                  </button>
                </div>

                {scanPaths.length > 0 ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {scanPaths.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-black/30 border border-white/[0.05] text-xs text-white/70 font-mono truncate">
                        <span className="truncate">{p}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/30 italic py-1">
                    No custom folders configured. Steam, Epic, and GOG libraries are auto-detected.
                  </div>
                )}
              </div>

              {/* Application Updates */}
              <SectionTitle title="Updates & About" />

              <div className="py-4 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">Otix Desktop Launcher</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/80">v{appVersion}</span>
                  </div>
                  <span className="text-xs text-white/50">
                    {updateStatus.status === 'downloaded'
                      ? 'New version ready to install!'
                      : updateStatus.status === 'downloading'
                      ? `Downloading update (${Math.round(updateStatus.progress?.percent || 0)}%)...`
                      : updateStatus.status === 'available'
                      ? `Update v${updateStatus.version} available`
                      : updateStatus.status === 'not-available'
                      ? 'You are running the latest version'
                      : updateStatus.status === 'error'
                      ? `Update check: ${updateStatus.error}`
                      : 'Automatic updates enabled'}
                  </span>
                </div>

                <div>
                  {updateStatus.status === 'downloaded' ? (
                    <button
                      onClick={handleInstallUpdate}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[oklch(0.705_0.213_47.604)] text-black text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Restart & Update</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleCheckUpdate}
                      disabled={isCheckingUpdate}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={isCheckingUpdate ? 'animate-spin' : ''} />
                      <span>{isCheckingUpdate ? 'Checking...' : 'Check Updates'}</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
