import { useState, useEffect, useCallback } from 'react'
import { Monitor, Power, MinusCircle, XCircle, ChevronUp, Eye, Loader2 } from 'lucide-react'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { useDesktopPlatform } from '@/lib/desktop-platform'
import './desktop.scss'

interface DesktopSettings {
  launchOnStartup: boolean
  minimizeToTray: boolean
  closeToTray: boolean
  alwaysOnTop: boolean
  startMinimized: boolean
}

const DEFAULT_SETTINGS: DesktopSettings = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="dk-settings-desktop__section-header">
      <h2 className="dk-settings-desktop__section-title">{title}</h2>
      <p className="dk-settings-desktop__section-desc">{description}</p>
    </div>
  )
}

interface SettingRowProps {
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onToggle: (checked: boolean) => void
  disabled?: boolean
}

function SettingRow({ icon, label, description, checked, onToggle, disabled }: SettingRowProps) {
  return (
    <div className="dk-settings-desktop__row">
      <div className="dk-settings-desktop__row-content">
        <div className="dk-settings-desktop__row-icon">
          {icon}
        </div>
        <div className="dk-settings-desktop__row-text">
          <p className="dk-settings-desktop__row-label">{label}</p>
          <p className="dk-settings-desktop__row-desc">{description}</p>
        </div>
      </div>
      <DkSwitch
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="dk-settings-desktop__row-action"
      />
    </div>
  )
}

export function DesktopSection() {
  const { isDesktop } = useDesktopPlatform()
  const [settings, setSettings] = useState<DesktopSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const api = (window as any).desktopAPI as {
    getDesktopSettings: () => Promise<DesktopSettings>
    setDesktopSettings: (s: Partial<DesktopSettings>) => Promise<DesktopSettings>
  } | undefined

  // Load settings on mount
  useEffect(() => {
    if (!api) {
      setLoading(false)
      return
    }
    api
      .getDesktopSettings()
      .then((s) => {
        setSettings(s)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [api])

  const handleToggle = useCallback(
    (key: keyof DesktopSettings) => async (checked: boolean) => {
      if (!api) return
      setSaving(key)
      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: checked }))
      try {
        const updated = await api.setDesktopSettings({ [key]: checked })
        setSettings(updated)
      } catch {
        // Revert on failure
        setSettings((prev) => ({ ...prev, [key]: !checked }))
      } finally {
        setSaving(null)
      }
    },
    [api],
  )

  if (!isDesktop) {
    return (
      <div className="dk-settings-desktop__body">
        <div className="dk-settings-desktop__card">
          <SectionHeader
            title="Desktop"
            description="Desktop settings are only available in the Otix desktop app."
          />
          <div className="dk-settings-desktop__notice">
            <Monitor className="h-5 w-5 mr-2" />
            Download the Otix desktop app to access these settings.
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="dk-settings-desktop__body">
        <div className="dk-settings-desktop__card">
          <SectionHeader title="Desktop" description="Configure your Otix desktop experience." />
          <div className="dk-settings-desktop__loading">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  const rows: SettingRowProps[] = [
    {
      icon: <Power className="h-5 w-5" />,
      label: 'Launch on startup',
      description: 'Automatically open Otix when you log in to your computer.',
      checked: settings.launchOnStartup,
      onToggle: handleToggle('launchOnStartup'),
    },
    {
      icon: <MinusCircle className="h-5 w-5" />,
      label: 'Minimize to tray',
      description: 'When minimizing, send Otix to the system tray instead of the taskbar.',
      checked: settings.minimizeToTray,
      onToggle: handleToggle('minimizeToTray'),
    },
    {
      icon: <XCircle className="h-5 w-5" />,
      label: 'Close to tray',
      description: 'Closing the window sends Otix to the system tray instead of quitting.',
      checked: settings.closeToTray,
      onToggle: handleToggle('closeToTray'),
    },
    {
      icon: <Eye className="h-5 w-5" />,
      label: 'Always on top',
      description: 'Keep the Otix window above all other windows.',
      checked: settings.alwaysOnTop,
      onToggle: handleToggle('alwaysOnTop'),
    },
    {
      icon: <ChevronUp className="h-5 w-5" />,
      label: 'Start minimized',
      description: 'Otix starts hidden in the system tray. Requires close/minimize-to-tray to be active.',
      checked: settings.startMinimized,
      onToggle: handleToggle('startMinimized'),
    },
  ]

  return (
    <div className="dk-settings-desktop__body">
      <div className="dk-settings-desktop__card">
        <SectionHeader
          title="Desktop"
          description="Configure your Otix desktop experience."
        />

        <div className="dk-settings-desktop__row-list">
          {rows.map((row) => (
            <SettingRow
              key={row.label}
              {...row}
              disabled={saving === String(row.label)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
