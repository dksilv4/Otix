import { describe, expect, it } from 'vitest'
import { isProbeReachable, getProbeLatency, formatProbeLatency } from '../node-probe'
import type { ServerProbeResult } from '@/features/downloads/types'

describe('node-probe utils', () => {
  it('returns true when reachable is true', () => {
    const probe: ServerProbeResult = {
      reachable: true,
      remoteAccessible: false,
      status: 'online',
      latencyMs: 12,
    }
    expect(isProbeReachable(probe)).toBe(true)
    expect(getProbeLatency(probe)).toBe(12)
    expect(formatProbeLatency(probe)).toBe('12ms')
  })

  it('handles snake_case fields correctly', () => {
    const probe: ServerProbeResult = {
      remote_accessible: true,
      status: 'online',
      latency_ms: 45,
    }
    expect(isProbeReachable(probe)).toBe(true)
    expect(getProbeLatency(probe)).toBe(45)
    expect(formatProbeLatency(probe)).toBe('45ms')
  })

  it('detects offline / unreachable nodes', () => {
    const probe: ServerProbeResult = {
      reachable: false,
      remoteAccessible: false,
      status: 'unreachable',
    }
    expect(isProbeReachable(probe)).toBe(false)
    expect(getProbeLatency(probe)).toBe(null)
    expect(formatProbeLatency(probe)).toBe('0ms')
  })

  it('handles null / undefined safely', () => {
    expect(isProbeReachable(null)).toBe(false)
    expect(isProbeReachable(undefined)).toBe(false)
    expect(getProbeLatency(null)).toBe(null)
    expect(formatProbeLatency(null)).toBe('0ms')
  })
})
