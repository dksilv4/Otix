import { useQuery } from '@tanstack/react-query'
import {
  Cpu,
  Monitor,
  HardDrive,
  Server,
  Zap,
  Gamepad2,
  Lock,
} from 'lucide-react'
import { userQueries } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'
import { formatHardwareStorageBytes } from '../../utils/profile-sections'

interface UserProfileHardwareRigProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
}

export const UserProfileHardwareRig = ({
  username,
  isOwner = false,
  visibility = 'private',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
}: UserProfileHardwareRigProps) => {
  const query = useQuery(userQueries.hardware(username))
  const data = query.data

  const specCards = [
    {
      title: 'Graphics Card (GPU)',
      value: data?.gpu || 'Not detected',
      icon: Zap,
      active: Boolean(data?.gpu),
    },
    {
      title: 'Processor (CPU)',
      value: data?.cpu || 'Not detected',
      icon: Cpu,
      active: Boolean(data?.cpu),
    },
    {
      title: 'Memory & OS',
      value: [data?.ram, data?.os].filter(Boolean).join(' · ') || 'Not detected',
      icon: HardDrive,
      active: Boolean(data?.ram || data?.os),
    },
    {
      title: 'Display & Target',
      value: data?.display || 'Standard Display',
      icon: Monitor,
      active: Boolean(data?.display),
    },
  ]

  const summaryParts: string[] = []
  if (data?.gpu) summaryParts.push(data.gpu)
  if (data?.nodeCount && data.nodeCount > 0) {
    summaryParts.push(`${data.nodeCount} node${data.nodeCount > 1 ? 's' : ''}`)
  }

  return (
    <div data-testid="user-profile-hardware-rig" className="w-full space-y-4">
      <SectionHeader
        icon={Cpu}
        title="Hardware & Rig"
        summary={summaryParts.length > 0 ? summaryParts.join(' · ') : undefined}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        {query.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : data?.isPrivate && !isOwner ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-base)]">
            <Lock className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              Hardware specifications are private
            </p>
          </div>
        ) : !data?.hasHardware ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <Cpu className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              No hardware telemetry recorded yet
            </p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs mt-0.5">
              Launch games or connect an Otix Node to record your rig specifications.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Primary Specs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {specCards.map((spec) => {
                const Icon = spec.icon
                return (
                  <div
                    key={spec.title}
                    className="p-4 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {spec.title}
                      </span>
                      <Icon className="h-4 w-4 text-primary/70" />
                    </div>
                    <span
                      className={`text-sm font-bold truncate block ${
                        spec.active ? 'text-foreground' : 'text-muted-foreground/50'
                      }`}
                    >
                      {spec.value}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Homelab & Storage Node Pod */}
            {(data.nodeCount > 0 || data.totalStorageBytes > 0) && (
              <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-[var(--dk-surface-ghost)] text-primary shrink-0">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground block">
                      Connected Homelab Infrastructure
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {data.nodeCount} node{data.nodeCount > 1 ? 's' : ''} connected
                      {data.serverCount > 0 ? ` · ${data.serverCount} server machines` : ''}
                    </span>
                  </div>
                </div>

                {data.totalStorageBytes > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--dk-surface-ghost)] text-foreground font-semibold">
                    <span className="text-muted-foreground text-[11px]">Total Storage:</span>
                    <span>{formatHardwareStorageBytes(data.totalStorageBytes)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Gaming Telemetry Banner */}
            {data.recentGame && data.avgFps != null && (
              <div className="p-3 rounded-xl bg-[var(--dk-surface-ghost)]/50 border border-[var(--dk-separator)] flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4 text-primary" />
                  <span>
                    Last recorded in <strong className="text-foreground">{data.recentGame}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1 font-bold text-foreground">
                  <span className="text-primary tabular-nums">{Math.round(data.avgFps)}</span>
                  <span>avg FPS</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
