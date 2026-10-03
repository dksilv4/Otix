import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useRunningGame, useLocalGames } from '@/features/launcher'
import type { LocalGame } from '@/features/launcher'
import { resolveSessionArtwork } from '../utils/game-art-resolver'

export interface SessionNodeInfo {
  id?: string | number | null
  name?: string | null
  url?: string | null
  installed?: boolean
  running?: boolean
}

export interface SessionHardwareInfo {
  cpu?: string
  gpu?: string
  ramBytes?: number
  os?: string
  discreteGpu?: boolean
}

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
  gameplayFrames?: number | null
  loadingSeconds?: number | null
  backgroundSeconds?: number | null
  gameplaySeconds?: number | null
  node?: SessionNodeInfo | null
  hardware?: SessionHardwareInfo | null
  hardwareSummary?: string | null
  shareEligible?: boolean
  posterUrl?: string | null
  bannerUrl?: string | null
  backdropUrl?: string | null
  slug?: string | null
}

export interface UserGameSessionsSummary {
  sessions: NormalizedPlaySession[]
  totalSessions: number
  totalDurationSeconds: number
  overallAvgFps: number | null
  overallAvgLow1: number | null
  activeSession?: NormalizedPlaySession | null
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
  const gameplayFrames = typeof fps.gameplay_frames === 'number' ? fps.gameplay_frames : typeof fps.gameplayFrames === 'number' ? fps.gameplayFrames : null
  const loadingSeconds = typeof fps.loading_seconds === 'number'
    ? fps.loading_seconds
    : typeof fps.loadingDurationMs === 'number'
      ? Math.round(fps.loadingDurationMs / 1000)
      : null
  const backgroundSeconds = typeof fps.background_seconds === 'number' ? fps.background_seconds : null
  const gameplaySeconds = typeof fps.gameplay_seconds === 'number' ? fps.gameplay_seconds : null

  const startTime = parseTimestamp((raw.start_time || raw.startTime) as string | number)
  const endTime = parseTimestamp((raw.end_time || raw.endTime) as string | number)
  const duration = typeof raw.duration_seconds === 'number'
    ? raw.duration_seconds
    : typeof raw.durationSeconds === 'number'
      ? raw.durationSeconds
      : Math.max(0, Math.round((endTime - startTime) / 1000))

  // Node detection & metadata
  let node: SessionNodeInfo | null = null
  if (raw.node && typeof raw.node === 'object') {
    const n = raw.node as Record<string, unknown>
    node = {
      id: (n.id as string | number) ?? null,
      name: (n.name as string) ?? null,
      url: (n.url as string) ?? null,
      installed: Boolean(n.installed),
      running: Boolean(n.running),
    }
  } else if (raw.node_name || raw.nodeName || raw.has_node_installed || raw.hasNodeInstalled) {
    node = {
      id: (raw.node_id as string | number) ?? (raw.nodeId as string | number) ?? null,
      name: (raw.node_name as string) ?? (raw.nodeName as string) ?? null,
      url: (raw.node_url as string) ?? (raw.nodeUrl as string) ?? null,
      installed: Boolean(raw.has_node_installed ?? raw.hasNodeInstalled ?? true),
      running: Boolean(raw.node_running ?? raw.nodeRunning ?? true),
    }
  }

  // Hardware detection & specs
  let hardware: SessionHardwareInfo | null = null
  if (raw.hardware && typeof raw.hardware === 'object') {
    const h = raw.hardware as Record<string, unknown>
    hardware = {
      cpu: (h.cpu as string) ?? undefined,
      gpu: (h.gpu as string) ?? undefined,
      ramBytes: typeof h.ramBytes === 'number' ? h.ramBytes : typeof h.ram_bytes === 'number' ? h.ram_bytes : undefined,
      os: (h.os as string) ?? undefined,
      discreteGpu: Boolean(h.discreteGpu ?? h.discrete_gpu),
    }
  }

  let hardwareSummary: string | null = null
  if (hardware?.gpu && hardware?.cpu) {
    const shortGpu = hardware.gpu.replace(/(NVIDIA|AMD|Radeon|GeForce|\(R\)|\(TM\))/gi, '').trim()
    const shortCpu = hardware.cpu.replace(/(Processor|8-Core|16-Core|12-Core|6-Core|32-Core|24-Core|\(R\)|\(TM\))/gi, '').trim()
    hardwareSummary = `${shortGpu || hardware.gpu} · ${shortCpu || hardware.cpu}`
  } else if (hardware?.gpu) {
    hardwareSummary = hardware.gpu
  } else if (hardware?.cpu) {
    hardwareSummary = hardware.cpu
  }

  const shareEligible = Boolean(
    raw.shareEligible ??
    raw.share_eligible ??
    node?.installed ??
    hardware?.gpu ??
    hardware?.cpu
  )

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
    gameplayFrames: gameplayFrames && gameplayFrames > 0 ? gameplayFrames : null,
    loadingSeconds: loadingSeconds && loadingSeconds > 0 ? loadingSeconds : null,
    backgroundSeconds: backgroundSeconds && backgroundSeconds > 0 ? backgroundSeconds : null,
    gameplaySeconds: gameplaySeconds && gameplaySeconds > 0 ? gameplaySeconds : null,
    node,
    hardware,
    hardwareSummary,
    shareEligible,
  }
}

export function useUserGameSessions(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const { runningGame, elapsedMs } = useRunningGame()
  const { data: localGames } = useLocalGames()

  // Build a lookup map from local games to resolve poster artwork for sessions
  const gameMap = useMemo(() => {
    if (!localGames || localGames.length === 0) return null
    const byId = new Map<string, LocalGame>()
    const byTitle = new Map<string, LocalGame>()
    for (const g of localGames) {
      byId.set(g.id, g)
      if (g.otixMediaId) byId.set(g.otixMediaId, g)
      byTitle.set(g.title.toLowerCase(), g)
    }
    return { byId, byTitle }
  }, [localGames])

  function resolveGameArt(session: NormalizedPlaySession): NormalizedPlaySession {
    const match = gameMap
      ? gameMap.byId.get(session.gameId) || gameMap.byTitle.get(session.gameTitle.toLowerCase())
      : null

    const resolved = resolveSessionArtwork(
      session.gameId,
      match?.otixMediaTitle || match?.title || session.gameTitle,
      session.processName,
      session.posterUrl || match?.data?.textlessPosterUrl || match?.otixTextlessPosterUrl || match?.otixPosterUrl || match?.posterUrl || match?.data?.posterUrl || null,
      session.backdropUrl || match?.otixBackdropUrl || match?.data?.backdropUrl || null
    )

    return {
      ...session,
      gameTitle: resolved.cleanedTitle || match?.otixMediaTitle || match?.title || session.gameTitle,
      posterUrl: resolved.posterUrl,
      bannerUrl: resolved.bannerUrl,
      backdropUrl: resolved.backdropUrl,
      slug: match?.data?.slug || match?.otixMediaSlug || session.slug || null,
    }
  }

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api) return

    const unsubStarted = api.onGameStarted?.(() => {
      queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
    })
    const unsubEnded = api.onGameEnded?.(() => {
      queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
    })
    const unsubStats = api.onFpsStats?.(() => {
      queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
    })
    const unsubUpdated = api.onSessionsUpdated?.(() => {
      queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
    })

    return () => {
      unsubStarted?.()
      unsubEnded?.()
      unsubStats?.()
      unsubUpdated?.()
    }
  }, [queryClient])

  const query = useQuery<UserGameSessionsSummary>({
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
      const rawNormalized: NormalizedPlaySession[] = []

      for (const raw of rawSessions) {
        const item = normalizeSession(raw)
        // Filter out instant background process checks (under 5s with no FPS)
        if (item.durationSeconds < 5 && (!item.avgFps || item.avgFps === 0)) {
          continue
        }
        rawNormalized.push(item)
      }

      // Sort by start time descending
      rawNormalized.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      const normalized: NormalizedPlaySession[] = []

      for (const item of rawNormalized) {
        // Group sessions for the same game starting within 15 seconds of each other
        const timeBucket = Math.round(item.startTime / 15000)
        const key = `${item.gameTitle.toLowerCase().trim()}-${timeBucket}`
        if (!seen.has(key) && !seen.has(item.id)) {
          seen.add(key)
          seen.add(item.id)
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
    refetchInterval: runningGame ? 5000 : false,
    enabled: options?.enabled ?? true,
  })

  const activeSession: NormalizedPlaySession | null = useMemo(() => {
    if (!runningGame) return null
    const currentFps = runningGame.fpsSnapshot?.currentFps ?? null
    const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000))
    const procName = runningGame.game.exePath
      ? runningGame.game.exePath.split(/[/\\]/).pop()
      : undefined

    const runningNode = runningGame.node || runningGame.fpsSnapshot?.node || null
    const runningHw = runningGame.hardware || runningGame.fpsSnapshot?.hardware || null
    let activeHwSummary: string | null = null
    if (runningHw?.gpu && runningHw?.cpu) {
      const shortGpu = runningHw.gpu.replace(/(NVIDIA|AMD|Radeon|GeForce|\(R\)|\(TM\))/gi, '').trim()
      const shortCpu = runningHw.cpu.replace(/(Processor|8-Core|16-Core|12-Core|6-Core|32-Core|24-Core|\(R\)|\(TM\))/gi, '').trim()
      activeHwSummary = `${shortGpu || runningHw.gpu} · ${shortCpu || runningHw.cpu}`
    } else if (runningHw?.gpu) {
      activeHwSummary = runningHw.gpu
    } else if (runningHw?.cpu) {
      activeHwSummary = runningHw.cpu
    }

    return {
      id: `active-${runningGame.game.id}-${runningGame.startTime}`,
      gameId: runningGame.game.id,
      gameTitle: runningGame.game.title,
      processName: procName,
      startTime: runningGame.startTime,
      endTime: null,
      durationSeconds: elapsedSec,
      avgFps: currentFps && currentFps > 0 ? currentFps : null,
      low1Percent: null,
      low01Percent: null,
      minFps: null,
      maxFps: null,
      totalFrames: runningGame.fpsSnapshot?.frameCount || null,
      node: runningNode,
      hardware: runningHw,
      hardwareSummary: activeHwSummary,
      shareEligible: Boolean(runningNode?.installed || runningHw?.gpu || runningHw?.cpu),
    }
  }, [runningGame, elapsedMs])

  const enrichedData = useMemo(() => {
    if (!query.data) return undefined

    // Resolve game artwork for all sessions
    const resolvedSessions = gameMap
      ? query.data.sessions.map(resolveGameArt)
      : query.data.sessions
    const resolvedActive = activeSession ? resolveGameArt(activeSession) : null

    return {
      ...query.data,
      sessions: resolvedSessions,
      ...(resolvedActive
        ? {
            activeSession: resolvedActive,
            totalDurationSeconds: query.data.totalDurationSeconds + resolvedActive.durationSeconds,
          }
        : {}),
    }
  }, [query.data, activeSession, gameMap])

  return {
    ...query,
    data: enrichedData,
  }
}
