import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  Cpu,
  Monitor,
  Gamepad2,
  Sparkles,
  HardDrive,
  Download,
  FolderOpen,
  Clock,
  RefreshCw,
  Activity,
  Server as ServerIcon,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { isDesktop, type DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import { cn, formatBytes, formatRAM, formatTimeAgo } from '@/lib/utils'
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  readStoredSettings,
  mapNodeSettings,
  formatUptime,
  formatDisplayTitle,
  formatDisplayResolution,
  getInternalStorageDisks,
  type NodeMachineData,
  type MachineHardware,
  type NodeCapabilities,
} from '../../utils/node-machine'

export {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  readStoredSettings,
  mapNodeSettings,
  formatUptime,
  formatDisplayTitle,
  formatDisplayResolution,
  getInternalStorageDisks,
  type NodeMachineData,
  type MachineHardware,
  type NodeCapabilities,
}

export const NodeMachineSettings = ({ server }: { server: GameServer }) => {
  const { toast } = useToast()
  const managingLocal = isDesktop() && isLocalDesktopNode(server)
  const storageKey = managingLocal ? STORAGE_KEY : `${STORAGE_KEY}:node:${server.id}`
  const [settings, setSettings] = useState<NodeMachineData>(() => readStoredSettings(server.id))
  const [loading, setLoading] = useState(true)
  const [refreshingHardware, setRefreshingHardware] = useState(false)
  const [, setSupported] = useState(false)
  const [platform, setPlatform] = useState('')

  const api = (window as unknown as { desktopAPI?: {
    getDesktopSettings: () => Promise<DesktopSettingsData>
    setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
    getDesktopHardware?: (refresh?: boolean) => Promise<MachineHardware | null>
    platform?: string
  } }).desktopAPI

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

          // Query host hardware in background without blocking desktop toggles
          let hw: MachineHardware | null = null
          if (api?.getDesktopHardware) {
            try {
              hw = await api.getDesktopHardware(false)
            } catch {
              // ignore
            }
          }
          if (!hw && (!api || !api.getDesktopHardware)) {
            try {
              const directRes = await fetch('http://127.0.0.1:8090/api/v1/hardware', {
                signal: AbortSignal.timeout(1500),
              })
              if (directRes.ok) {
                hw = await directRes.json()
              }
            } catch {
              // ignore
            }
          }
          if (!cancelled && hw) {
            setSettings((prev) => {
              const updated = { ...prev, hardware: hw }
              try {
                localStorage.setItem(storageKey, JSON.stringify(updated))
              } catch {
                // ignore
              }
              return updated
            })
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
          if (!mapped.hardware && server.primaryUrl && !server.primaryUrl.startsWith('otix://')) {
            try {
              const directRes = await fetch(`${server.primaryUrl.replace(/\/$/, '')}/api/v1/hardware`, {
                signal: AbortSignal.timeout(1500),
              })
              if (directRes.ok) {
                const hw = await directRes.json()
                if (hw) mapped.hardware = hw
              }
            } catch {
              // ignore
            }
          }
          setSettings(mapped)
          try {
            localStorage.setItem(storageKey, JSON.stringify(mapped))
          } catch {
            // ignore storage quota error
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
  }, [api, managingLocal, server.id, server.primaryUrl, storageKey])

  const handleRefreshHardware = useCallback(async () => {
    setRefreshingHardware(true)
    try {
      if (managingLocal) {
        let hardwareUpdated = false
        let mapped = { ...settings }
        if (api?.getDesktopSettings) {
          try {
            const local = await api.getDesktopSettings()
            if (local) mapped = { ...mapped, ...local }
          } catch {
            // ignore
          }
        }
        if (api?.getDesktopHardware) {
          try {
            const hw = await api.getDesktopHardware(true)
            if (hw) {
              mapped.hardware = hw
              hardwareUpdated = true
            }
          } catch {
            // ignore
          }
        }
        if (!hardwareUpdated) {
          try {
            const directRes = await fetch('http://127.0.0.1:8090/api/v1/hardware?refresh=true', {
              signal: AbortSignal.timeout(2000),
            })
            if (directRes.ok) {
              const hw = await directRes.json()
              if (hw) {
                mapped.hardware = hw
                hardwareUpdated = true
              }
            }
          } catch {
            // ignore
          }
        }
        setSettings(mapped)
        try {
          localStorage.setItem(storageKey, JSON.stringify(mapped))
        } catch {
          // ignore
        }
        toast({
          title: 'Hardware scan complete',
          description: hardwareUpdated
            ? 'Host machine components updated.'
            : 'Host machine components verified.',
          variant: 'success',
        })
        return
      }

      const res = await apiClient.get<Record<string, unknown>>(`/library/nodes/${server.id}/desktop?refresh=true`)
      if (res?.data) {
        const mapped = mapNodeSettings(res.data)
        if (!mapped.hardware && server.primaryUrl && !server.primaryUrl.startsWith('otix://')) {
          try {
            const directRes = await fetch(`${server.primaryUrl.replace(/\/$/, '')}/api/v1/hardware?refresh=true`, {
              signal: AbortSignal.timeout(2000),
            })
            if (directRes.ok) {
              const hw = await directRes.json()
              if (hw) mapped.hardware = hw
            }
          } catch {
            // ignore
          }
        }
        setSettings(mapped)
        try {
          localStorage.setItem(storageKey, JSON.stringify(mapped))
        } catch {
          // ignore
        }
        toast({
          title: 'Hardware scan complete',
          description: `Refreshed hardware components on ${server.name}.`,
          variant: 'success',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Scan failed',
        description: (err as { message?: string })?.message || 'Could not query host hardware from node daemon.',
        variant: 'error',
      })
    } finally {
      setRefreshingHardware(false)
    }
  }, [api, managingLocal, server.id, server.name, server.primaryUrl, settings, storageKey, toast])

  if (loading) {
    return (
      <SettingsCard className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </SettingsCard>
    )
  }

  const caps = settings.capabilities || {}
  const hw = settings.hardware
  const displayPlatform = platform || (managingLocal ? 'Local Desktop' : 'Linux')
  const isWindows = displayPlatform.toLowerCase().includes('win')
  const internalDisks = getInternalStorageDisks(hw?.storage)

  // Multi-monitor layout calculations
  const displays = hw?.displays || []
  const minX = displays.length > 0 ? Math.min(...displays.map((d) => d.positionX)) : 0
  const maxX = displays.length > 0 ? Math.max(...displays.map((d) => d.positionX + d.width)) : 1920
  const minY = displays.length > 0 ? Math.min(...displays.map((d) => d.positionY)) : 0
  const maxY = displays.length > 0 ? Math.max(...displays.map((d) => d.positionY + d.height)) : 1080
  const totalW = Math.max(1, maxX - minX)
  const totalH = Math.max(1, maxY - minY)

  return (
    <div className="space-y-4">
      {/* 1. Free Section: System & Host Identity */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          icon={ServerIcon}
          title="System Identity"
          description={
            managingLocal
              ? 'Operating system, BIOS, machine platform, and daemon runtime uptime.'
              : `Operating system, BIOS, machine platform, and daemon runtime uptime on ${server.name}.`
          }
          action={
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshHardware}
              disabled={refreshingHardware || loading}
              className="gap-1.5 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground border border-white/[0.06] hover:bg-[var(--dk-surface-hover)] cursor-pointer"
            >
              <RefreshCw size={13} className={refreshingHardware ? 'animate-spin text-primary' : ''} />
              <span>{refreshingHardware ? 'Scanning...' : 'Re-scan Hardware'}</span>
            </DkButton>
          }
        />

        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.04] pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <ServerIcon size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground tracking-tight">
                    {hw?.system?.hostname || settings.hostname || server.name}
                  </span>
                  {hw?.os?.platform && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground uppercase">
                      {hw.os.platform}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {hw?.system?.model
                    ? `${hw.system.manufacturer ? `${hw.system.manufacturer} ` : ''}${hw.system.model}`
                    : `Host Node: ${server.name}`}
                  {hw?.system?.biosVersion ? ` · BIOS ${hw.system.biosVersion}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-xl bg-primary/15 text-primary font-semibold text-xs">
                Online & Ready
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                <Clock size={12} className="text-muted-foreground" />
                <span>Uptime: {formatUptime(settings.uptimeSeconds)}</span>
              </div>
            </div>
          </div>

          {/* OS & Runtime identity sub-row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Operating System</span>
              <span className="font-semibold text-foreground truncate block mt-0.5">
                {hw?.os?.name || displayPlatform} {hw?.os?.version || ''}
              </span>
              {hw?.os?.build && <span className="text-[10px] text-muted-foreground">Build {hw.os.build}</span>}
            </div>

            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Architecture</span>
              <span className="font-semibold text-foreground truncate block mt-0.5">
                {hw?.os?.architecture || settings.arch || 'amd64'}
              </span>
              <span className="text-[10px] text-muted-foreground">{settings.goVersion || 'Daemon Runtime'}</span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Total Memory</span>
              <span className="font-semibold text-foreground truncate block mt-0.5">
                {hw?.memory?.totalBytes ? formatRAM(hw.memory.totalBytes) : 'N/A'}
              </span>
              <span className="text-[10px] text-muted-foreground">Physical Capacity</span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Last Hardware Probe</span>
              <span className="font-semibold text-primary truncate block mt-0.5">
                {hw?.probedAt ? formatTimeAgo(hw.probedAt) : 'Live Cached'}
              </span>
              <span className="text-[10px] text-muted-foreground">Dynamic refresh</span>
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* 2. Free Section: Connected Displays & Desktop Arrangement */}
      {displays.length > 0 && (
        <SettingsCard className="space-y-4">
          <SectionHeader
            icon={Monitor}
            title="Connected Displays & Desktop Arrangement"
            description="Physical display layout, resolutions, refresh rates, and spatial orientation."
            badges={
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                {displays.length} Attached Monitor{displays.length === 1 ? '' : 's'}
              </span>
            }
          />

          {/* Interactive Visual Multi-Monitor Layout Canvas */}
          <div className="space-y-3">
            <div className="relative w-full h-48 sm:h-56 rounded-2xl bg-[var(--dk-surface-overlay)] border border-white/[0.04] p-4 flex items-center justify-center overflow-hidden">
              {/* Desktop canvas grid background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--dk-separator)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

              <div
                className="relative"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  height: '100%',
                  aspectRatio: `${totalW} / ${totalH}`,
                }}
              >
                {displays.map((d) => {
                  const leftPct = ((d.positionX - minX) / totalW) * 100
                  const topPct = ((d.positionY - minY) / totalH) * 100
                  const widthPct = (d.width / totalW) * 100
                  const heightPct = (d.height / totalH) * 100
                  const title = formatDisplayTitle(d)
                  const resolutionLabel = formatDisplayResolution(d)

                  return (
                    <div
                      key={d.deviceName || `${d.index}-${d.name}`}
                      className={cn(
                        'absolute rounded-xl p-2.5 flex flex-col justify-between transition-colors select-none',
                        d.isPrimary
                          ? 'bg-primary/15 border border-primary/40'
                          : 'bg-[var(--dk-surface-field)] border border-white/[0.06] hover:bg-[var(--dk-surface-hover)]',
                      )}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded font-mono',
                            d.isPrimary
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-[var(--dk-surface-raised)] text-foreground/80',
                          )}
                        >
                          {d.index}
                        </span>
                        {d.isPrimary && (
                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-primary/20 text-primary uppercase tracking-wider">
                            Primary
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 py-0.5">
                        <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                          {title}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {resolutionLabel}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-white/[0.04]">
                        <span className="truncate">{d.orientation || 'Landscape'}</span>
                        <span className="font-mono">{d.positionX},{d.positionY}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Monitor Specification Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displays.map((d) => {
                const title = formatDisplayTitle(d)
                const resolutionLabel = formatDisplayResolution(d)

                return (
                  <div
                    key={d.deviceName || `${d.index}-${d.name}`}
                    className={cn(
                      'p-3.5 rounded-2xl border space-y-2',
                      d.isPrimary
                        ? 'bg-primary/[0.06] border-primary/25'
                        : 'bg-[var(--dk-surface-raised)] border-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.2 rounded font-mono shrink-0',
                            d.isPrimary ? 'bg-primary text-primary-foreground' : 'bg-[var(--dk-surface-field)] text-muted-foreground',
                          )}
                        >
                          {d.index}
                        </span>
                        <span className="text-xs font-semibold text-foreground truncate">
                          {title}
                        </span>
                      </div>
                      {d.isPrimary && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-wider shrink-0">
                          Primary
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--dk-surface-field)] text-foreground/80 font-mono">
                        {resolutionLabel}
                      </span>
                      {d.orientation && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--dk-surface-field)] text-muted-foreground">
                          {d.orientation}
                        </span>
                      )}
                    </div>

                    {d.arrangement && (
                      <div className="pt-1.5 border-t border-white/[0.04] flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Arrangement</span>
                        <span className="font-medium text-primary">{d.arrangement}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </SettingsCard>
      )}

      {/* 3. Free Section Pair: Processor (CPU) & Graphics (GPU) */}
      {hw && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Processor Card */}
          <SettingsCard className="space-y-4">
            <SectionHeader
              icon={Cpu}
              title="Processor (CPU)"
              description="Compute architecture, cores, and clock frequencies."
              badges={
                hw.cpu?.vendor ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                    {hw.cpu.vendor}
                  </span>
                ) : undefined
              }
            />

            <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground leading-snug">
                  {hw.cpu?.modelName || 'Host Processor'}
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.04] text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Cores / Threads</span>
                  <span className="font-semibold text-foreground/90">
                    {hw.cpu?.cores || 0}C / {hw.cpu?.threads || settings.numCpu || 0}T
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Base Clock</span>
                  <span className="font-semibold text-foreground/90">
                    {hw.cpu?.baseClockMhz ? `${(hw.cpu.baseClockMhz / 1000).toFixed(2)} GHz` : 'Dynamic'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Architecture</span>
                  <span className="font-semibold text-foreground/90 uppercase">{hw.cpu?.architecture || 'amd64'}</span>
                </div>
              </div>
            </div>
          </SettingsCard>

          {/* Graphics Card */}
          <SettingsCard className="space-y-4">
            <SectionHeader
              icon={Monitor}
              title="Graphics (GPU)"
              description="Dedicated and integrated display adapters."
              badges={
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                  {hw.gpus?.length || 0} Adapter{hw.gpus?.length === 1 ? '' : 's'}
                </span>
              }
            />

            <div className="space-y-2.5">
              {hw.gpus && hw.gpus.length > 0 ? (
                hw.gpus.map((gpu, idx) => (
                  <div
                    key={`${gpu.name}-${idx}`}
                    className="p-3 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground leading-tight">
                        {gpu.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {gpu.isDiscrete ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                            Discrete
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--dk-surface-raised)] text-muted-foreground">
                            Integrated
                          </span>
                        )}
                        {gpu.isPrimary && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                            Primary
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {gpu.vramBytes && gpu.vramBytes > 0
                          ? `${formatBytes(gpu.vramBytes)} Dedicated VRAM`
                          : 'Shared System VRAM'}
                      </span>
                      {gpu.driverVersion && (
                        <span className="font-mono text-[10px]">Driver: {gpu.driverVersion}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic py-3">
                  Standard or integrated display adapter detected.
                </p>
              )}
            </div>
          </SettingsCard>
        </div>
      )}

      {/* 4. Free Section Pair: System Memory (RAM) & Fixed Storage Disks */}
      {hw && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Memory Card */}
          <SettingsCard className="space-y-4">
            <SectionHeader
              icon={Activity}
              title="System Memory (RAM)"
              description="Installed host RAM capacity."
              badges={
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                  Physical Memory
                </span>
              }
            />

            <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-3">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl font-black text-foreground font-mono">
                  {formatRAM(hw.memory?.totalBytes || 0)}
                </span>
                <span className="text-xs text-muted-foreground">Installed Physical RAM</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Total physical RAM capacity installed on host machine.
              </p>

              <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.04] text-xs text-muted-foreground">
                <span>Hardware Spec</span>
                <span className="font-semibold text-foreground/90">
                  {formatRAM(hw.memory?.totalBytes || 0)} Total
                </span>
              </div>
            </div>
          </SettingsCard>

          {/* Storage Disks Card */}
          <SettingsCard className="space-y-4">
            <SectionHeader
              icon={HardDrive}
              title="Fixed Disks"
              description="Internal storage volumes and available capacity."
              badges={
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)] border border-white/[0.06] text-muted-foreground">
                  {internalDisks.length} Internal Drive{internalDisks.length === 1 ? '' : 's'}
                </span>
              }
            />

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {internalDisks.length > 0 ? (
                internalDisks.map((disk, idx) => (
                  <div
                    key={`${disk.drive}-${idx}`}
                    className="p-3 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-foreground">{disk.drive}</span>
                        {disk.label && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                            ({disk.label})
                          </span>
                        )}
                        {disk.fileSystem && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-[var(--dk-surface-raised)] text-muted-foreground">
                            {disk.fileSystem}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-foreground/80">
                        {disk.usagePercent.toFixed(1)}% used
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-[var(--dk-surface-overlay)] overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-colors duration-500',
                          disk.usagePercent > 90
                            ? 'bg-destructive'
                            : disk.usagePercent > 75
                              ? 'bg-primary/80'
                              : 'bg-primary',
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, disk.usagePercent))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatBytes(disk.freeBytes)} free</span>
                      <span>{formatBytes(disk.totalBytes)} total</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic py-3">No fixed internal storage reported.</p>
              )}
            </div>
          </SettingsCard>
        </div>
      )}

      {/* 5. Free Section: Capability Feature Pills */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          icon={Sparkles}
          title="Identified Capabilities"
          description="Active daemon capabilities and subsystem features supported on this node."
        />

        <div className="p-3.5 sm:p-4 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04] space-y-2">
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.04]">
              <Gamepad2 size={14} className="text-primary" />
              Game Process Tracking ({caps.game_tracking !== false ? 'Active' : 'Unsupported'})
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.04]">
              <Sparkles size={14} className="text-primary" />
              {isWindows ? 'Win32 Native In-Game Overlay' : 'OBS / Web HUD Overlay'}
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.04]">
              <HardDrive size={14} className="text-primary" />
              Save State Backups (Automated)
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.04]">
              <Download size={14} className="text-primary" />
              Downloader Provider ({caps.downloader_provider ? 'Ready' : 'Standby'})
            </span>

            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-raised)] text-foreground border border-white/[0.04]">
              <FolderOpen size={14} className="text-primary" />
              {isWindows ? 'Silent Game Installer (NSIS / Inno)' : 'Proton / Wine Runner'}
            </span>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
