import { useState, useEffect, useCallback } from 'react'
import { Gamepad2, FolderOpen, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { SettingsCard } from './settings-card'
import { SectionHeader } from './settings-section-header'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { getDesktopAPI, hasDesktopAPI, type DetectedEmulator, type DesktopSettingsData } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import {
  KEY_CONSOLE_PLATFORMS,
  getEmulatorsSupportingPlatform,
} from '@/features/settings/utils/emulators'

export const SettingsEmulatorsCard = () => {
  const { toast } = useToast()
  const isDesktop = hasDesktopAPI()

  const [emulators, setEmulators] = useState<DetectedEmulator[]>([])
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!isDesktop) return
    const api = getDesktopAPI()
    if (!api) return

    setIsLoading(true)
    try {
      const [emus, settings] = await Promise.all([
        api.getEmulators ? api.getEmulators() : Promise.resolve([]),
        api.getDesktopSettings ? api.getDesktopSettings() : Promise.resolve(null),
      ])
      setEmulators(emus || [])
      setDesktopSettings(settings)
    } catch (err: any) {
      console.error('[SettingsEmulatorsCard] Failed to load emulators:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isDesktop])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePickPath = async (emulatorId: string) => {
    const api = getDesktopAPI()
    if (!api?.pickExecutable || !api?.setDesktopSettings) return

    const selected = await api.pickExecutable()
    if (!selected) return

    try {
      const updatedPaths = {
        ...(desktopSettings?.emulatorPaths || {}),
        [emulatorId]: selected,
      }
      await api.setDesktopSettings({ emulatorPaths: updatedPaths })
      await loadData()
      toast({
        title: 'Emulator Path Saved',
        description: `Custom executable path saved for ${emulatorId}.`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Error Saving Path',
        description: err.message || 'Could not save emulator path.',
        variant: 'destructive',
      })
    }
  }

  const handleSelectDefaultEmulator = async (platform: string, emulatorId: string) => {
    const api = getDesktopAPI()
    if (!api?.setDesktopSettings) return

    try {
      const updatedDefaults = {
        ...(desktopSettings?.defaultPlatformEmulators || {}),
        [platform]: emulatorId,
      }
      await api.setDesktopSettings({ defaultPlatformEmulators: updatedDefaults })
      await loadData()
      toast({
        title: 'Default Runner Updated',
        description: `Set ${emulatorId} as default for ${platform.toUpperCase()}.`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({
        title: 'Error Saving Default',
        description: err.message || 'Could not update default emulator.',
        variant: 'destructive',
      })
    }
  }

  if (!isDesktop) {
    return (
      <SettingsCard>
        <SectionHeader
          icon={Gamepad2}
          title="Emulators & Consoles"
          description="Configure emulator executables, auto-detection, and default console runners."
        />
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-xs text-muted-foreground">
          Emulators and local process dispatching are managed through the Otix Desktop application.
        </div>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard>
      <div className="flex items-center justify-between">
        <SectionHeader
          icon={Gamepad2}
          title="Emulators & Consoles"
          description="Configure emulator executables, auto-detection, and default console runners."
        />
        <DkButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={isLoading}
          onClick={loadData}
          className="gap-2 shrink-0"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span>Rescan</span>
        </DkButton>
      </div>

      {/* Emulators list */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Detected Emulators
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {emulators.map((emu) => {
            const isInstalled = emu.installed
            return (
              <div
                key={emu.id}
                className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {emu.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isInstalled
                          ? 'bg-primary/15 text-primary'
                          : 'bg-white/5 text-muted-foreground'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <CheckCircle2 size={11} />
                          <span>{emu.isCustomPath ? 'Custom Path' : 'Detected'}</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={11} />
                          <span>Not Found</span>
                        </>
                      )}
                    </span>
                  </div>
                  {emu.definition.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {emu.definition.description}
                    </p>
                  )}
                  {emu.executablePath && (
                    <p className="text-[11px] font-mono text-muted-foreground/70 truncate mt-1 bg-white/[0.02] px-2 py-1 rounded-lg">
                      {emu.executablePath}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                  <div className="flex items-center gap-1 flex-wrap">
                    {emu.definition.platforms.slice(0, 4).map((p) => (
                      <span
                        key={p}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-white/5 text-muted-foreground"
                      >
                        {p}
                      </span>
                    ))}
                    {emu.definition.platforms.length > 4 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        +{emu.definition.platforms.length - 4}
                      </span>
                    )}
                  </div>
                  <DkButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePickPath(emu.id)}
                    className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <FolderOpen size={12} />
                    <span>Browse...</span>
                  </DkButton>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Platform Default Runners */}
      <div className="space-y-3 pt-4 border-t border-white/[0.04]">
        <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Default Runners Per Console
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {KEY_CONSOLE_PLATFORMS.map((plat) => {
            const supporting = getEmulatorsSupportingPlatform(emulators, plat.id)
            if (supporting.length === 0) return null

            const currentDefault =
              desktopSettings?.defaultPlatformEmulators?.[plat.id] || supporting[0]?.id

            const options = supporting.map((e) => ({
              value: e.id,
              label: `${e.name}${e.installed ? ' (Ready)' : ''}`,
            }))

            return (
              <div
                key={plat.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="min-w-0 pr-2">
                  <span className="text-xs font-medium text-foreground block truncate">
                    {plat.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    {plat.id}
                  </span>
                </div>
                <DkDropdown
                  options={options}
                  value={currentDefault}
                  onChange={(val) => handleSelectDefaultEmulator(plat.id, val)}
                  className="w-36 text-xs"
                />
              </div>
            )
          })}
        </div>
      </div>
    </SettingsCard>
  )
}
