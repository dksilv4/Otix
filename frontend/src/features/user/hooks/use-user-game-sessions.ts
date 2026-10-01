import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'

export interface NormalizedPlaySession {
  id: string
  gameId: string
  gameTitle: string
  processName?: string
  startTime: number
  endTime?: number | null
  durationSeconds: number
  avgFps: number | null
  low1Percent: number | null
  low01Percent: number | null
  minFps: number | null
  maxFps: number | null
  totalFrames: number | null
}

export interface UserGameSessionsSummary {
  sessions: NormalizedPlaySession[]
  totalSessions: number
  totalDurationSeconds: number
  overallAvgFps: number | null
  overallAvgLow1: number | null
}

function parseTimestamp(ts: string | number | undefined | null): number {
  if (!ts) return 0
  if (typeof ts === 'number') {
    return ts < 1e11 ? ts * 1000 : ts
  }
  const parsed = new Date(ts).getTime()
  return isNaN(parsed) ? 0 : parsed
}

export function normalizeSession(raw: Record<string, unknown>): NormalizedPlaySession {
  const fps = (raw.fps_stats || raw.fpsStats || {}) as Record<string, unknown>
  const avgFps = typeof fps.avg_fps === 'number' ? fps.avg_fps : typeof fps.avgFps === 'number' ? fps.avgFps : null
  const low1 = typeof fps.low_1_percent === 'number' ? fps.low_1_percent : typeof fps.onePercentLow === 'number' ? fps.onePercentLow : null
  const low01 = typeof fps.low_01_percent === 'number' ? fps.low_01_percent : typeof fps.zeroPointOnePercentLow === 'number' ? fps.zeroPointOnePercentLow : null
  const min = typeof fps.min_fps === 'number' ? fps.min_fps : typeof fps.minFps === 'number' ? fps.minFps : null
  const max = typeof fps.max_fps === 'number' ? fps.max_fps : typeof fps.maxFps === 'number' ? fps.maxFps : null
  const frames = typeof fps.total_frames === 'number' ? fps.total_frames : typeof fps.totalFrames === 'number' ? fps.totalFrames : null

  const startTime = parseTimestamp((raw.start_time || raw.startTime) as string | number)
  const endTime = parseTimestamp((raw.end_time || raw.endTime) as string | number)
  const duration = typeof raw.duration_seconds === 'number'
    ? raw.duration_seconds
    : typeof raw.durationSeconds === 'number'
      ? raw.durationSeconds
      : Math.max(0, Math.round((endTime - startTime) / 1000))

  return {
    id: String(raw.id || `${raw.game_id || raw.gameId}-${startTime}`),
    gameId: String(raw.game_id || raw.gameId || ''),
    gameTitle: String(raw.game_title || raw.gameTitle || 'Unknown Game'),
    processName: typeof raw.process_name === 'string' ? raw.process_name : typeof raw.processName === 'string' ? raw.processName : undefined,
    startTime,
    endTime: endTime > 0 ? endTime : null,
    durationSeconds: duration,
    avgFps: avgFps && avgFps > 0 ? avgFps : null,
    low1Percent: low1 && low1 > 0 ? low1 : null,
    low01Percent: low01 && low01 > 0 ? low01 : null,
    minFps: min && min > 0 ? min : null,
    maxFps: max && max > 0 ? max : null,
    totalFrames: frames && frames > 0 ? frames : null,
  }
}

export function useUserGameSessions(options?: { enabled?: boolean }) {
  return useQuery<UserGameSessionsSummary>({
    queryKey: ['user-game-sessions'],
    queryFn: async () => {
      const rawSessions: Record<string, unknown>[] = []

      // 1. Electron Desktop API
      const api = getDesktopAPI()
      if (api?.getRecentSessions) {
        try {
          const desk = await api.getRecentSessions()
          if (Array.isArray(desk)) {
            rawSessions.push(...(desk as unknown as Record<string, unknown>[]))
          }
        } catch {
          // ignore
        }
      }

      // 2. Direct Node daemon probe if on localhost
      if (rawSessions.length === 0) {
        try {
          const res = await fetch('http://127.0.0.1:8090/api/v1/games/sessions')
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              rawSessions.push(...data)
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. Central Backend Proxy
      if (rawSessions.length === 0) {
        try {
          const { data } = await apiClient.get<Record<string, unknown>[]>('/library/game-sessions')
          if (Array.isArray(data)) {
            rawSessions.push(...data)
          }
        } catch {
          // ignore
        }
      }

      // Deduplicate and normalize
      const seen = new Set<string>()
      const normalized: NormalizedPlaySession[] = []

      for (const raw of rawSessions) {
        const item = normalizeSession(raw)
        const key = item.id || `${item.gameId}-${item.startTime}`
        if (!seen.has(key)) {
          seen.add(key)
          normalized.push(item)
        }
      }

      normalized.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))

      const totalSessions = normalized.length
      const totalDurationSeconds = normalized.reduce((acc, s) => acc + s.durationSeconds, 0)

      const withFps = normalized.filter((s) => s.avgFps !== null && s.avgFps > 0)
      const overallAvgFps = withFps.length > 0
        ? withFps.reduce((acc, s) => acc + (s.avgFps || 0), 0) / withFps.length
        : null

      const withLow1 = normalized.filter((s) => s.low1Percent !== null && s.low1Percent > 0)
      const overallAvgLow1 = withLow1.length > 0
        ? withLow1.reduce((acc, s) => acc + (s.low1Percent || 0), 0) / withLow1.length
        : null

      return {
        sessions: normalized,
        totalSessions,
        totalDurationSeconds,
        overallAvgFps,
        overallAvgLow1,
      }
    },
    staleTime: 1000 * 30,
    enabled: options?.enabled ?? true,
  })
}
