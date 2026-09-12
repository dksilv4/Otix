import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Gamepad2,
  Palette,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Monitor,
  CheckCircle2,
  HardDrive,
  Sliders,
  Play,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { LAUNCHER_THEMES, type LauncherThemeId } from '@/features/launcher/themes/theme-context'
import { hasDesktopAPI, getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@/old-features/ui/molecules/toast'
import { cn } from '@/lib/utils'

export function SettingsLauncherPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const isDesktop = hasDesktopAPI()
  const { settings, update } = useLauncherSettings()

  const [activeTheme, setActiveTheme] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem('otix:launcher-theme') as LauncherThemeId | null
      if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) return stored
    } catch {}
    return 'modern'
  })

  // Desktop native settings
  const [desktopSettings, setDesktopSettings] = useState({
    launchOnStartup: false,
    minimizeToTray: false,
    closeToTray: false,
  })
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)

  useEffect(() => {
    const api = window.desktopAPI as any
    if (!api) return

    api.getDesktopSettings?.().then((ds: any) => {
      if (ds) setDesktopSettings(ds)
    }).catch(() => {})

    api.getScanPaths?.().then((paths: any[]) => {
      if (Array.isArray(paths)) {
        setScanPaths(paths.filter((p) => p.type === 'game').map((p) => p.path))
      }
    }).catch(() => {})
  }, [])

  const handleSelectTheme = (themeId: LauncherThemeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('otix:launcher-theme', themeId)
    window.dispatchEvent(new Event('storage'))
    toast({
      title: 'Launcher Theme Updated',
      description: `Default layout set to ${LAUNCHER_THEMES.find((t) => t.id === themeId)?.name}.`,
      variant: 'success',
    })
  }

  const handleDesktopToggle = useCallback(
    async (key: 'launchOnStartup' | 'minimizeToTray' | 'closeToTray', val: boolean) => {
      const api = window.desktopAPI as any
      if (!api?.setDesktopSettings) return
      setDesktopSettings((prev) => ({ ...prev, [key]: val }))
      try {
        await api.setDesktopSettings({ [key]: val })
      } catch {
        setDesktopSettings((prev) => ({ ...prev, [key]: !val }))
      }
    },
    []
  )

  const handleAddScanFolder = async () => {
    const api = getDesktopAPI()
    if (!api?.selectDirectory || !api?.addScanPath) return
    try {
      const dir = await api.selectDirectory()
      if (!dir) return
      await api.addScanPath(dir, 'game')
      setScanPaths((prev) => [...prev, dir])
      toast({
        title: 'Library Path Added',
        description: `Added ${dir} to game scan paths.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add folder path.',
        variant: 'error',
      })
    }
  }

  const handleTriggerScan = async () => {
    const api = getDesktopAPI()
    if (!api?.scanPaths) return
    try {
      setIsScanning(true)
      await api.scanPaths(scanPaths, [])
      toast({
        title: 'Scan Finished',
        description: 'Updated your local library with detected executables.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Scan Error',
        description: 'Failed to scan library paths.',
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div id="settings-launcher-section" className="space-y-6">
      {/* ── Quick Launch Banner ── */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-black font-black shadow-lg shadow-primary/20">
            <Gamepad2 size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Otix Game Launcher</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Experience your games across 10 completely unique layouts and console experiences.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate({ to: '/launcher' })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-primary/20"
        >
          <span>Open Launcher</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* ── Theme Selection Section ── */}
      <SettingsCard>
        <SectionHeader
          title="Launcher Theme & Layout Edition"
          description="Select your default launcher interface. All 10 themes read the same game library, user profiles, and active play sessions."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {LAUNCHER_THEMES.map((theme) => {
            const isSelected = activeTheme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelectTheme(theme.id)}
                className={cn(
                  'flex flex-col items-start p-4 rounded-xl border transition-all text-left cursor-pointer group relative overflow-hidden',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.25)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20'
                )}
              >
                {isSelected && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1 bg-primary"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                )}
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {theme.version}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      BETA
                    </span>
                  </div>
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[10px] font-extrabold text-primary">
                      <CheckCircle2 size={12} />
                      Active
                    </span>
                  ) : null}
                </div>

                <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                  {theme.name}
                </span>
                <span className="text-[10px] text-primary/80 font-semibold tracking-wide uppercase mt-0.5">
                  {theme.subtitle}
                </span>
                <p className="text-[11px] text-white/50 font-normal leading-relaxed mt-2 line-clamp-2">
                  {theme.description}
                </p>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      {/* ── Playback & Display Options ── */}
      <SettingsCard>
        <SectionHeader
          title="Display & Behavior"
          description="Fine-tune animations, backdrop transitions, and launcher start behaviors."
        />

        <div className="divide-y divide-white/[0.06]">
          <SettingsRow
            label="Dynamic Background Transitions"
            description="Dynamically shift wallpaper artwork and cinematic gradients based on hovered games"
          >
            <DkSwitch
              checked={settings.backgroundTransitions}
              onCheckedChange={(checked) => update('backgroundTransitions', checked)}
            />
          </SettingsRow>

          <SettingsRow
            label="Landing View Format"
            description="Default tab or landing format when entering the launcher"
          >
            <select
              value={settings.defaultPage}
              onChange={(e) => update('defaultPage', e.target.value as any)}
              className="bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer hover:border-white/30 transition-colors"
            >
              <option value="library" className="bg-neutral-900 text-white">
                Library (Full Catalog)
              </option>
              <option value="slide-picker" className="bg-neutral-900 text-white">
                Spotlight Carousel
              </option>
            </select>
          </SettingsRow>
        </div>
      </SettingsCard>

      {/* ── Desktop & Process Management (When running Desktop App) ── */}
      {isDesktop && (
        <SettingsCard>
          <SectionHeader
            title="Desktop Process Integration"
            description="Configure system startup, background tray residency, and game scanning directories."
          />

          <div className="divide-y divide-white/[0.06]">
            <SettingsRow
              label="Launch on System Startup"
              description="Automatically start Otix when logging into your computer"
            >
              <DkSwitch
                checked={desktopSettings.launchOnStartup}
                onCheckedChange={(checked) => handleDesktopToggle('launchOnStartup', checked)}
              />
            </SettingsRow>

            <SettingsRow
              label="Minimize to System Tray"
              description="Keep Otix running quietly in the tray when minimized"
            >
              <DkSwitch
                checked={desktopSettings.minimizeToTray}
                onCheckedChange={(checked) => handleDesktopToggle('minimizeToTray', checked)}
              />
            </SettingsRow>

            <SettingsRow
              label="Close to System Tray"
              description="Do not terminate the application when closing the window"
            >
              <DkSwitch
                checked={desktopSettings.closeToTray}
                onCheckedChange={(checked) => handleDesktopToggle('closeToTray', checked)}
              />
            </SettingsRow>

            {/* Scan Paths */}
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-white block">Game Library Scan Paths</span>
                  <span className="text-xs text-white/50">
                    Folders where Otix automatically locates game executables and metadata.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddScanFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <FolderPlus size={14} />
                    <span>Add Folder</span>
                  </button>
                  <button
                    onClick={handleTriggerScan}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
                    <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {scanPaths.length > 0 ? (
                  scanPaths.map((p, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-white/70 flex items-center gap-2"
                    >
                      <FolderOpen size={14} className="text-primary shrink-0" />
                      <span className="truncate">{p}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-xs text-white/40 text-center">
                    No custom directories added yet. Standard Steam/GOG libraries are automatically detected.
                  </div>
                )}
              </div>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  )
}
