import { useState, useEffect, useCallback } from 'react'
import { Monitor, Power, MinusCircle, XCircle, ChevronUp, Eye, Loader2 } from 'lucide-react'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import type { DesktopSettingsData } from '@/lib/desktop/api'

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

export function DesktopSection() {
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
    <div className="space-y-6">
      <div className="rounded-2xl p-6 space-y-6" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h2 className="text-lg font-semibold">Desktop</h2>
          <p className="mt-1 text-sm text-white/60">Desktop settings are only available in the Otix desktop app.</p>
        </div>
        <div className="flex items-center justify-center py-8 text-sm text-white/60">
          <Monitor className="h-5 w-5 mr-2" />
          Download the Otix desktop app to access these settings.
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 space-y-6" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h2 className="text-lg font-semibold">Desktop</h2>
          <p className="mt-1 text-sm text-white/60">Configure your Otix desktop experience.</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      </div>
    </div>
  )

  const rows = [
    { key: 'launchOnStartup' as const, icon: <Power className="h-5 w-5" />, label: 'Launch on startup', desc: 'Automatically open Otix when you log in to your computer.' },
    { key: 'minimizeToTray' as const, icon: <MinusCircle className="h-5 w-5" />, label: 'Minimize to tray', desc: 'When minimizing, send Otix to the system tray instead of the taskbar.' },
    { key: 'closeToTray' as const, icon: <XCircle className="h-5 w-5" />, label: 'Close to tray', desc: 'Closing the window sends Otix to the system tray instead of quitting.' },
    { key: 'alwaysOnTop' as const, icon: <Eye className="h-5 w-5" />, label: 'Always on top', desc: 'Keep the Otix window above all other windows.' },
    { key: 'startMinimized' as const, icon: <ChevronUp className="h-5 w-5" />, label: 'Start minimized', desc: 'Otix starts hidden in the system tray. Requires close/minimize-to-tray to be active.' },
  ]

  const SettingRow = ({ icon, label, description, checked, onToggle, disabled }: {
    icon: React.ReactNode; label: string; description: string; checked: boolean;
    onToggle: (c: boolean) => void; disabled?: boolean
  }) => (
    <div className="flex items-center justify-between rounded-xl px-4 py-4 bg-white/5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-white/60">{description}</p>
        </div>
      </div>
      <DkSwitch checked={checked} onCheckedChange={onToggle} disabled={disabled} className="ml-3 shrink-0" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 space-y-6" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h2 className="text-lg font-semibold">Desktop</h2>
          <p className="mt-1 text-sm text-white/60">Configure your Otix desktop experience.</p>
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <SettingRow
              key={r.key} icon={r.icon} label={r.label} description={r.desc}
              checked={settings[r.key]} onToggle={handleToggle(r.key)}
              disabled={saving === r.key}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
