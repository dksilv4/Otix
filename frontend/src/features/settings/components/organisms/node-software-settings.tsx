import { useState, useEffect, useCallback } from 'react'
import {
  Power,
  HardDrive,
  Loader2,
} from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsNodeSharingSection } from './settings-node-sharing-section'
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  readStoredSettings,
  mapNodeSettings,
  type NodeMachineData,
} from '../../utils/node-machine'

export const NodeSoftwareSettings = ({ server }: { server: GameServer }) => {
  const { toast } = useToast()
  const managingLocal = isLocalDesktopNode(server)
  const storageKey = managingLocal ? STORAGE_KEY : `${STORAGE_KEY}:node:${server.id}`
  const [settings, setSettings] = useState<NodeMachineData>(() => readStoredSettings(server.id))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const [platform, setPlatform] = useState('')

  const api = (window as unknown as {
    desktopAPI?: {
      getDesktopSettings: () => Promise<DesktopSettingsData>
      setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
      platform?: string
    }
  }).desktopAPI

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      setLoading(true)
      try {
        if (managingLocal) {
          let mapped = readStoredSettings(server.id)
          if (api?.getDesktopSettings) {
            try {
              const local = await api.getDesktopSettings()
              if (local) mapped = { ...DEFAULT_SETTINGS, ...local, hardware: mapped.hardware }
            } catch {
              // ignore
            }
          }
          if (!cancelled) {
            setSettings(mapped)
            setSupported(true)
            setPlatform(api?.platform || 'desktop')
            setLoading(false)
            try {
              localStorage.setItem(storageKey, JSON.stringify(mapped))
            } catch {
              // ignore
            }
          }
          return
        }

        const res = await apiClient.get<Record<string, unknown>>(`/library/nodes/${server.id}/desktop`)
        const fetchedSettings = res?.data
        if (!cancelled && fetchedSettings) {
          const nextPlatform = String(fetchedSettings.platform || 'linux')
          setPlatform(nextPlatform)
          setSupported(Boolean(fetchedSettings.supported ?? (nextPlatform === 'windows' || nextPlatform === 'linux')))
          const mapped = mapNodeSettings(fetchedSettings)
          setSettings(mapped)
          try {
            localStorage.setItem(storageKey, JSON.stringify(mapped))
          } catch {
            // ignore
          }
        }
      } catch {
        if (!cancelled) {
          setSettings(readStoredSettings(server.id))
          setSupported(false)
          setPlatform('unknown')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [api, managingLocal, server.id, storageKey])

  const handleToggle = useCallback(
    (key: keyof NodeMachineData) => async (checked: boolean) => {
      setSaving(key)
      const next = { ...settings, [key]: checked }
      setSettings(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // ignore
      }

      if (managingLocal) {
        try {
          if (api?.setDesktopSettings) {
            const updated = await api.setDesktopSettings({ [key]: checked })
            setSettings((prev) => ({ ...DEFAULT_SETTINGS, ...prev, ...updated }))
          }
        } catch (err) {
          toast({
            title: 'Failed to update setting',
            description: String(err),
            variant: 'error',
          })
        } finally {
          setSaving(null)
        }
        return
      }

      try {
        const res = await apiClient.post<Record<string, unknown>>(`/library/nodes/${server.id}/desktop`, {
          [key]: checked,
        })
        const updatedData = res?.data
        if (updatedData) {
          setSettings((prev) => mapNodeSettings(updatedData, prev))
        }
        toast({
          title: 'Setting updated',
          description: supported ? `Applied on ${server.name} (${platform}).` : `Saved on ${server.name}.`,
          variant: 'success',
        })
      } catch {
        toast({
          title: 'Saved locally',
          description: 'This node is unreachable. Setting saved in the browser until it comes back.',
          variant: 'info',
        })
      } finally {
        setSaving(null)
      }
    },
    [api, managingLocal, platform, server.id, server.name, settings, storageKey, supported, toast],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. Node Daemon & Service Behavior */}
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Node Daemon & Service Behavior"
          description={
            managingLocal
              ? 'Autostart and background operations for the local node.'
              : `Service startup and background task behavior on ${server.name}.`
          }
        />

        <div className="space-y-2">
          <SettingsRow
            icon={<Power className="h-5 w-5" />}
            label="Launch on startup"
            description="Start this node daemon automatically when the host system boots."
            action={
              <DkSwitch
                checked={Boolean(settings.launchOnStartup)}
                onCheckedChange={handleToggle('launchOnStartup')}
                disabled={saving === 'launchOnStartup'}
                className="ml-3 shrink-0"
              />
            }
          />

          <SettingsRow
            icon={<HardDrive className="h-5 w-5" />}
            label="Auto-backup game saves"
            description="Automatically snapshot game save files whenever a tracked play session closes on this node."
            action={
              <DkSwitch
                checked={Boolean(settings.autoBackupOnExit)}
                onCheckedChange={handleToggle('autoBackupOnExit')}
                disabled={saving === 'autoBackupOnExit'}
                className="ml-3 shrink-0"
              />
            }
          />
        </div>
      </SettingsCard>

      {/* 2. Node Sharing & Access Permissions */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Node Sharing & Network Access"
          description={`Manage access permissions and share libraries hosted on ${server.name} with friends.`}
        />
        <SettingsNodeSharingSection server={server} />
      </SettingsCard>
    </div>
  )
}
