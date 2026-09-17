import { useState, useEffect, useCallback } from 'react'
import { Monitor, Power, MinusCircle, XCircle, ChevronUp, Eye, Loader2 } from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { SectionHeader } from '../components/molecules/settings-section-header'

const DEFAULT_SETTINGS: DesktopSettingsData = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  aiAddonEnabled: false,
  aiModelStatus: 'not_available',
  aiSystemPrompt: '',
}

export function SettingsDesktopPage() {
  const { isDesktop } = useDesktopPlatform()
  const [settings, setSettings] = useState<DesktopSettingsData>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const api = window.desktopAPI as unknown as {
    getDesktopSettings: () => Promise<DesktopSettingsData>
    setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
  } | undefined

  useEffect(() => {
    if (!api) { setLoading(false); return }
    api.getDesktopSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false))
  }, [api])

  const handleToggle = useCallback((key: keyof DesktopSettingsData) => async (checked: boolean) => {
    if (!api) return
    setSaving(key)
    setSettings((prev) => ({ ...prev, [key]: checked }))
    try {
      const updated = await api.setDesktopSettings({ [key]: checked })
      setSettings(updated)
    } catch {
      setSettings((prev) => ({ ...prev, [key]: !checked }))
    } finally {
      setSaving(null)
    }
  }, [api])

  if (!isDesktop) return (
    <div id="settings-desktop-section" className="space-y-5">
      <SettingsCard>
        <div className="text-center space-y-5 max-w-xl mx-auto">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Monitor className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-white tracking-tight">Otix Desktop App Features</h3>
            <p className="text-xs text-white/60 leading-relaxed max-w-md mx-auto">
              Desktop settings (system tray integration, launch at startup, local game library scanning, auto-downloads, and hardware acceleration) are available in the native Otix Desktop App.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <a
              href="https://otix.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-6 py-2.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md active:scale-[0.98]"
            >
              <Monitor className="h-4 w-4" />
              <span>Download Otix Desktop</span>
            </a>
          </div>
        </div>
      </SettingsCard>
    </div>
  )

  if (loading) return (
    <div className="space-y-5">
      <SettingsCard>
        <SectionHeader variant="page" title="Desktop" description="Configure your Otix desktop experience." />
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      </SettingsCard>
    </div>
  )

  const rows = [
    { key: 'launchOnStartup' as const, icon: <Power className="h-5 w-5" />, label: 'Launch on startup', desc: 'Automatically open Otix when you log in to your computer.' },
    { key: 'minimizeToTray' as const, icon: <MinusCircle className="h-5 w-5" />, label: 'Minimize to tray', desc: 'When minimizing, send Otix to the system tray instead of the taskbar.' },
    { key: 'closeToTray' as const, icon: <XCircle className="h-5 w-5" />, label: 'Close to tray', desc: 'Closing the window sends Otix to the system tray instead of quitting.' },
    { key: 'alwaysOnTop' as const, icon: <Eye className="h-5 w-5" />, label: 'Always on top', desc: 'Keep the Otix window above all other windows.' },
    { key: 'startMinimized' as const, icon: <ChevronUp className="h-5 w-5" />, label: 'Start minimized', desc: 'Otix starts hidden in the system tray. Requires close/minimize-to-tray to be active.' },
  ]

  return (
    <div id="settings-desktop-section" className="space-y-5">
      <SettingsCard>
        <SectionHeader variant="page" title="Desktop" description="Configure your Otix desktop experience." />
        <div className="space-y-2">
          {rows.map((r) => (
            <SettingsRow
              key={r.key}
              icon={r.icon}
              label={r.label}
              description={r.desc}
              action={
                <DkSwitch
                  checked={settings[r.key]}
                  onCheckedChange={handleToggle(r.key)}
                  disabled={saving === r.key}
                  className="ml-3 shrink-0"
                />
              }
            />
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}
