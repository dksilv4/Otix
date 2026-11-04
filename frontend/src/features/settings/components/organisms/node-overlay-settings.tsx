import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  Gamepad2,
  Monitor,
  Layers,
  Loader2,
  Tv,
  Activity,
  Clock,
  Eye,
  Keyboard,
  Gauge,
} from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { SectionHeader } from '../molecules/settings-section-header'
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  readStoredSettings,
  mapNodeSettings,
  type NodeMachineData,
} from '../../utils/node-machine'

export const NodeOverlaySettings = ({ server }: { server: GameServer }) => {
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
              if (local) {
                mapped = {
                  ...DEFAULT_SETTINGS,
                  ...local,
                  hardware: mapped.hardware,
                  overlayMonitors: local.overlayMonitors || mapped.overlayMonitors,
                }
              }
            } catch {
              // ignore
            }
          }

          // Query local node daemon directly for monitors and live overlay state
          const port = mapped.embeddedNodePort || 8090
          if (!mapped.overlayMonitors || mapped.overlayMonitors.length === 0) {
            try {
              const directMonitors = await fetch(`http://127.0.0.1:${port}/api/v1/games/overlay/monitors`, {
                signal: AbortSignal.timeout(1500),
              })
              if (directMonitors.ok) {
                const mons = await directMonitors.json()
                if (Array.isArray(mons) && mons.length > 0) {
                  mapped = { ...mapped, overlayMonitors: mons }
                }
              }
            } catch {
              // ignore
            }
          }
          try {
            const directOverlay = await fetch(`http://127.0.0.1:${port}/api/v1/games/overlay/settings`, {
              signal: AbortSignal.timeout(1500),
            })
            if (directOverlay.ok) {
              const liveOv = await directOverlay.json()
              if (liveOv) {
                if (typeof liveOv.enabled === 'boolean') mapped.overlayEnabled = liveOv.enabled
                if (liveOv.corner) mapped.overlayCorner = liveOv.corner
                if (liveOv.monitor) mapped.overlayMonitor = liveOv.monitor
                if (liveOv.hotkey) mapped.overlayHotkey = liveOv.hotkey
                if (typeof liveOv.show_fps === 'boolean') mapped.overlayShowFps = liveOv.show_fps
                if (typeof liveOv.show_percentiles === 'boolean') mapped.overlayShowPercentiles = liveOv.show_percentiles
                if (typeof liveOv.show_playtime === 'boolean') mapped.overlayShowPlaytime = liveOv.show_playtime
                if (typeof liveOv.show_title === 'boolean') mapped.overlayShowTitle = liveOv.show_title
                if (typeof liveOv.opacity === 'number' && liveOv.opacity > 0) mapped.overlayOpacity = liveOv.opacity
                if (typeof liveOv.only_track_scanned === 'boolean') mapped.onlyTrackScannedGames = liveOv.only_track_scanned
              }
            }
          } catch {
            // ignore
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
          } else {
            const port = settings.embeddedNodePort || 8090
            await fetch(`http://127.0.0.1:${port}/api/v1/games/overlay/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [key]: checked }),
              signal: AbortSignal.timeout(1500),
            })
          }
          toast({
            title: 'HUD setting updated',
            description: 'Applied to in-game performance overlay.',
            variant: 'success',
          })
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

  const handleSelectChange = useCallback(
    (key: keyof NodeMachineData) => async (value: string) => {
      setSaving(key)
      const parsedVal = key === 'overlayOpacity' ? Number(value) : value
      const next = { ...settings, [key]: parsedVal }
      setSettings(next)
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // ignore
      }

      if (managingLocal) {
        try {
          if (api?.setDesktopSettings) {
            const updated = await api.setDesktopSettings({ [key]: parsedVal })
            setSettings((prev) => ({ ...prev, ...updated }))
          } else {
            const port = settings.embeddedNodePort || 8090
            await fetch(`http://127.0.0.1:${port}/api/v1/games/overlay/settings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [key]: parsedVal }),
              signal: AbortSignal.timeout(1500),
            })
          }
          toast({
            title: 'HUD setting updated',
            description: 'Applied to in-game performance overlay.',
            variant: 'success',
          })
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
          [key]: parsedVal,
        })
        const updatedData = res?.data
        if (updatedData) {
          setSettings((prev) => mapNodeSettings(updatedData, prev))
        }
        toast({
          title: 'Setting updated',
          description: `Applied on ${server.name}.`,
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
    [api, managingLocal, server.id, server.name, settings, storageKey, toast],
  )

  const caps = settings.capabilities || {}

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. Game Process Auto-Detection Card */}
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Game Detection & Process Tracking"
          description={
            managingLocal
              ? 'Real-time background scanning for active game processes on this machine.'
              : `Process monitoring for launched games on ${server.name}.`
          }
        />
        <div className="space-y-2">
          <SettingsRow
            icon={<Gamepad2 className="h-5 w-5" />}
            label="Game process auto-detection"
            description="Monitor running processes every 3 seconds to detect when a game launches, track playtime, and engage the HUD overlay."
            action={
              <DkSwitch
                checked={Boolean(settings.gameTracking)}
                onCheckedChange={handleToggle('gameTracking')}
                disabled={saving === 'gameTracking'}
                className="ml-3 shrink-0"
              />
            }
          />
        </div>
      </SettingsCard>

      {/* 2. In-Game Performance HUD Card */}
      {caps.game_tracking !== false && (
        <SettingsCard className="space-y-3">
          <SectionHeader
            title="In-Game Performance HUD"
            description="Transparent, click-through overlay showing live frame rates, 1% low frame timings, and play duration."
          />

          <div className="space-y-2">
            <SettingsRow
              icon={<Sparkles className="h-5 w-5" />}
              label="In-game performance overlay"
              description="Activate click-through transparent Win32 HUD over active game windows. Toggle on/off anytime in-game using Ctrl+`."
              action={
                <DkSwitch
                  checked={Boolean(settings.overlayEnabled)}
                  onCheckedChange={handleToggle('overlayEnabled')}
                  disabled={saving === 'overlayEnabled'}
                  className="ml-3 shrink-0"
                />
              }
            />

            {settings.overlayEnabled && (
              <>
                <SettingsRow
                  icon={<Layers className="h-5 w-5" />}
                  label="Overlay layout style"
                  description="Choose whether the overlay displays as a monitor-wide status bar or docks to a corner."
                  action={
                    <DkSelect
                      value={settings.overlayCorner || 'top-wide'}
                      onChange={(e) => handleSelectChange('overlayCorner')(e.target.value)}
                      disabled={saving === 'overlayCorner'}
                      className="h-9 text-xs py-0 w-48 sm:w-64"
                    >
                      <option value="top-wide" className="bg-card text-card-foreground">
                        Top Edge (Monitor-Wide Bar)
                      </option>
                      <option value="bottom-wide" className="bg-card text-card-foreground">
                        Bottom Edge (Monitor-Wide Bar)
                      </option>
                      <option value="top-right" className="bg-card text-card-foreground">
                        Top Right Pill
                      </option>
                      <option value="top-left" className="bg-card text-card-foreground">
                        Top Left Pill
                      </option>
                      <option value="bottom-right" className="bg-card text-card-foreground">
                        Bottom Right Pill
                      </option>
                      <option value="bottom-left" className="bg-card text-card-foreground">
                        Bottom Left Pill
                      </option>
                    </DkSelect>
                  }
                />

                <SettingsRow
                  icon={<Monitor className="h-5 w-5" />}
                  label="Assigned monitor"
                  description="Direct the HUD to a dedicated display screen or follow the active game monitor."
                  action={
                    <DkSelect
                      value={settings.overlayMonitor || 'auto'}
                      onChange={(e) => handleSelectChange('overlayMonitor')(e.target.value)}
                      disabled={saving === 'overlayMonitor'}
                      className="h-9 text-xs py-0 w-48 sm:w-64"
                    >
                      <option value="auto" className="bg-card text-card-foreground">
                        Auto (Follow Active Game)
                      </option>
                      {settings.overlayMonitors && settings.overlayMonitors.length > 0 ? (
                        settings.overlayMonitors.map((m) => (
                          <option key={m.id} value={m.id} className="bg-card text-card-foreground">
                            {m.name}
                            {m.width && m.height ? ` (${m.width}x${m.height})` : ''}
                            {m.is_primary || m.isPrimary ? ' - Primary' : ''}
                          </option>
                        ))
                      ) : (
                        <option value="1" className="bg-card text-card-foreground">
                          Auto (Primary Display)
                        </option>
                      )}
                    </DkSelect>
                  }
                />

                <SettingsRow
                  icon={<Gauge className="h-5 w-5" />}
                  label="Instant FPS counter"
                  description="Display live frames per second with dynamic color grading based on performance targets."
                  action={
                    <DkSwitch
                      checked={settings.overlayShowFps !== false}
                      onCheckedChange={handleToggle('overlayShowFps')}
                      disabled={saving === 'overlayShowFps'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                <SettingsRow
                  icon={<Activity className="h-5 w-5" />}
                  label="1% Low & Average framerates"
                  description="Show 1% low stutter indicators and session-averaged FPS to detect frame pacing anomalies."
                  action={
                    <DkSwitch
                      checked={settings.overlayShowPercentiles !== false}
                      onCheckedChange={handleToggle('overlayShowPercentiles')}
                      disabled={saving === 'overlayShowPercentiles'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                <SettingsRow
                  icon={<Clock className="h-5 w-5" />}
                  label="Session playtime duration"
                  description="Display elapsed active play time on the in-game HUD."
                  action={
                    <DkSwitch
                      checked={settings.overlayShowPlaytime !== false}
                      onCheckedChange={handleToggle('overlayShowPlaytime')}
                      disabled={saving === 'overlayShowPlaytime'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                <SettingsRow
                  icon={<Tv className="h-5 w-5" />}
                  label="Game title & branding"
                  description="Display Otix brand tag and the detected game title on the monitor-wide bar."
                  action={
                    <DkSwitch
                      checked={settings.overlayShowTitle !== false}
                      onCheckedChange={handleToggle('overlayShowTitle')}
                      disabled={saving === 'overlayShowTitle'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                <SettingsRow
                  icon={<Gamepad2 className="h-5 w-5" />}
                  label="Only track library games"
                  description="Restrict HUD overlay and performance tracking to games in your scanned Otix library or custom process mappings."
                  action={
                    <DkSwitch
                      checked={settings.onlyTrackScannedGames !== false}
                      onCheckedChange={handleToggle('onlyTrackScannedGames')}
                      disabled={saving === 'onlyTrackScannedGames'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                <SettingsRow
                  icon={<Eye className="h-5 w-5" />}
                  label="HUD transparency / opacity"
                  description="Adjust HUD glass background opacity for readability against gameplay."
                  action={
                    <DkSelect
                      value={String(settings.overlayOpacity ?? 0.92)}
                      onChange={(e) => handleSelectChange('overlayOpacity')(e.target.value)}
                      disabled={saving === 'overlayOpacity'}
                      className="h-9 text-xs py-0 w-48 sm:w-64"
                    >
                      <option value="1" className="bg-card text-card-foreground">
                        100% (Solid Surface)
                      </option>
                      <option value="0.92" className="bg-card text-card-foreground">
                        92% (Glassmorphic - Recommended)
                      </option>
                      <option value="0.8" className="bg-card text-card-foreground">
                        80% (Translucent)
                      </option>
                      <option value="0.7" className="bg-card text-card-foreground">
                        70% (Subtle Minimalist)
                      </option>
                    </DkSelect>
                  }
                />

                <SettingsRow
                  icon={<Keyboard className="h-5 w-5" />}
                  label="In-game hotkey shortcut"
                  description="Press while in-game to toggle HUD visibility or cycle layout positions without Alt+Tab."
                  action={
                    <div className="flex items-center gap-2">
                      <kbd className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-[var(--dk-surface-field)] border border-white/[0.06] text-foreground shadow-xs">
                        {settings.overlayHotkey || 'Ctrl+`'}
                      </kbd>
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        (or Ctrl+Shift+O)
                      </span>
                    </div>
                  }
                />

                {/* Live Preview Box of the selected HUD style */}
                <div className="pt-2">
                  <div className="p-3 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      HUD Layout Preview ({settings.overlayCorner || 'top-wide'})
                    </span>
                    <div className="relative w-full h-24 rounded-xl bg-[var(--dk-surface-overlay)] border border-white/[0.04] flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--dk-separator)_1px,transparent_1px)] bg-[size:12px_12px] opacity-40 pointer-events-none" />

                      {/* Simulated Monitor-Wide Bar (Top) */}
                      {(settings.overlayCorner === 'top-wide' || !settings.overlayCorner) && (
                        <div className="absolute top-2 inset-x-4 h-6 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-3 flex items-center justify-between text-[11px] font-mono text-foreground/90">
                          {settings.overlayShowTitle !== false ? (
                            <span className="text-primary font-bold">OTIX | Game Title</span>
                          ) : (
                            <span className="text-primary font-bold">OTIX</span>
                          )}
                          <div className="flex items-center gap-3">
                            {settings.overlayShowFps !== false && (
                              <span className="font-bold text-primary">144 FPS</span>
                            )}
                            {settings.overlayShowPercentiles !== false && (
                              <span className="text-muted-foreground text-[10px]">1%: 118 · Avg: 141</span>
                            )}
                            {settings.overlayShowPlaytime !== false && (
                              <span className="text-muted-foreground text-[10px]">01:24:12</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Simulated Monitor-Wide Bar (Bottom) */}
                      {settings.overlayCorner === 'bottom-wide' && (
                        <div className="absolute bottom-2 inset-x-4 h-6 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-3 flex items-center justify-between text-[11px] font-mono text-foreground/90">
                          {settings.overlayShowTitle !== false ? (
                            <span className="text-primary font-bold">OTIX | Game Title</span>
                          ) : (
                            <span className="text-primary font-bold">OTIX</span>
                          )}
                          <div className="flex items-center gap-3">
                            {settings.overlayShowFps !== false && (
                              <span className="font-bold text-primary">144 FPS</span>
                            )}
                            {settings.overlayShowPercentiles !== false && (
                              <span className="text-muted-foreground text-[10px]">1%: 118 · Avg: 141</span>
                            )}
                            {settings.overlayShowPlaytime !== false && (
                              <span className="text-muted-foreground text-[10px]">01:24:12</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Corner Pill - Top Right */}
                      {settings.overlayCorner === 'top-right' && (
                        <div className="absolute top-2 right-3 h-7 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-2.5 flex items-center gap-2 text-[10px] font-mono text-foreground/90">
                          {settings.overlayShowFps !== false && (
                            <span className="font-bold text-primary text-xs">144 FPS</span>
                          )}
                          {settings.overlayShowPercentiles !== false && (
                            <span className="text-muted-foreground">118 Low</span>
                          )}
                          {settings.overlayShowPlaytime !== false && (
                            <span className="text-muted-foreground">01:24</span>
                          )}
                        </div>
                      )}

                      {/* Corner Pill - Top Left */}
                      {settings.overlayCorner === 'top-left' && (
                        <div className="absolute top-2 left-3 h-7 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-2.5 flex items-center gap-2 text-[10px] font-mono text-foreground/90">
                          {settings.overlayShowFps !== false && (
                            <span className="font-bold text-primary text-xs">144 FPS</span>
                          )}
                          {settings.overlayShowPercentiles !== false && (
                            <span className="text-muted-foreground">118 Low</span>
                          )}
                          {settings.overlayShowPlaytime !== false && (
                            <span className="text-muted-foreground">01:24</span>
                          )}
                        </div>
                      )}

                      {/* Corner Pill - Bottom Right */}
                      {settings.overlayCorner === 'bottom-right' && (
                        <div className="absolute bottom-2 right-3 h-7 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-2.5 flex items-center gap-2 text-[10px] font-mono text-foreground/90">
                          {settings.overlayShowFps !== false && (
                            <span className="font-bold text-primary text-xs">144 FPS</span>
                          )}
                          {settings.overlayShowPercentiles !== false && (
                            <span className="text-muted-foreground">118 Low</span>
                          )}
                          {settings.overlayShowPlaytime !== false && (
                            <span className="text-muted-foreground">01:24</span>
                          )}
                        </div>
                      )}

                      {/* Corner Pill - Bottom Left */}
                      {settings.overlayCorner === 'bottom-left' && (
                        <div className="absolute bottom-2 left-3 h-7 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 px-2.5 flex items-center gap-2 text-[10px] font-mono text-foreground/90">
                          {settings.overlayShowFps !== false && (
                            <span className="font-bold text-primary text-xs">144 FPS</span>
                          )}
                          {settings.overlayShowPercentiles !== false && (
                            <span className="text-muted-foreground">118 Low</span>
                          )}
                          {settings.overlayShowPlaytime !== false && (
                            <span className="text-muted-foreground">01:24</span>
                          )}
                        </div>
                      )}

                      <span className="text-[11px] text-muted-foreground/40 font-medium">Game Viewport</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </SettingsCard>
      )}
    </div>
  )
}
