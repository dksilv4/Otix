import type { ServerProbeResult } from '@/features/downloads/types'

export function isProbeReachable(probe: ServerProbeResult | null | undefined): boolean {
  if (!probe) return false
  if (probe.reachable !== undefined) return Boolean(probe.reachable)
  if (probe.remoteAccessible !== undefined) return Boolean(probe.remoteAccessible)
  if (probe.remote_accessible !== undefined) return Boolean(probe.remote_accessible)
  if (probe.localAccessible !== undefined) return Boolean(probe.localAccessible)
  if (probe.local_accessible !== undefined) return Boolean(probe.local_accessible)
  return probe.status === 'online'
}

export function getProbeLatency(probe: ServerProbeResult | null | undefined): number | null {
  if (!probe) return null
  const latency = probe.latencyMs ?? probe.latency_ms
  return typeof latency === 'number' ? latency : null
}

export function formatProbeLatency(probe: ServerProbeResult | null | undefined): string {
  const latency = getProbeLatency(probe)
  return latency != null ? `${latency}ms` : '0ms'
}
